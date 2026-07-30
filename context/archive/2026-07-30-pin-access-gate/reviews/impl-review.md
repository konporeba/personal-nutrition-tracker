<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: PIN Access Gate

- **Plan**: context/changes/pin-access-gate/plan.md
- **Scope**: Phase 3 of 3 (full plan review)
- **Date**: 2026-07-30
- **Verdict**: REJECTED
- **Findings**: 1 critical, 3 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Forgot-PIN can strand a live Supabase session with the local PIN already wiped

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/pin-gate-screen.tsx:113-124
- **Detail**: `onForgotPin` calls `await clearPin()` before `await signOutOwner()`, with no try/catch around either. If `clearPin()` succeeds but `signOutOwner()` then throws (network hiccup, transient Supabase error — plausible on a mobile connection), the local PIN record is wiped while the Supabase session stays valid and persisted. On the next render, `hasPinSet` is `false`, so `PinGateScreen` renders `PinSetup` directly — anyone with physical access to the locked device can set a brand-new PIN and walk straight into the app without ever proving the Supabase credential. That credential is exactly the security boundary "Forgot PIN?" is supposed to route through, per the plan's own Critical Implementation Details section ("doing only one of the two leaves the owner stuck") — this failure mode does the opposite: it leaves an *attacker* unstuck.
- **Fix**: Swap the order — call `signOutOwner()` first and only call `clearPin()` after it resolves successfully; wrap both in try/catch so a failure leaves the PIN intact and surfaces an inline error instead of silently defeating the gate.
- **Decision**: FIXED

### F2 — Missing `catch` on all three PIN-form submit handlers (silent failure, no user feedback)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/pin-gate-screen.tsx:39-43 (`PinSetup.onSubmit`), src/components/pin-gate-screen.tsx:99-110 (`PinEntry.onSubmit`), src/app/(profile)/pin-security.tsx:39-49 (`onSubmit`)
- **Detail**: All three wrap their AsyncStorage-backed call (`setPin`/`unlock`/`changePin`) in `try { ... } finally { setSubmitting(false) }` with no `catch`. If the underlying call throws (e.g. `AsyncStorage.setItem` failing on a full or quota-limited store), the exception becomes an unhandled promise rejection: `submitting` resets so the UI looks idle again, but no error is shown and the operation silently failed. `src/components/owner-sign-in.tsx:21-31` establishes this codebase's sibling pattern for identical async-form submissions — `try { await ... } catch (e) { setError(...) } finally { ... }` — and all three new screens drop the `catch`.
- **Fix**: Add a `catch` block to each of the three `onSubmit` handlers that sets an inline error message (e.g. "Couldn't save your PIN. Try again."), matching `owner-sign-in.tsx`'s shape.
- **Decision**: FIXED

### F3 — No PIN format validation at the state-layer boundary

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/pin-gate.tsx — `setPin` (79-85), `unlock` (87-95), `changePin` (104-114)
- **Detail**: None of these functions validate that the PIN is a 6-digit numeric string before hashing/persisting/comparing it — the 6-digit constraint exists only in the UI layer (`onlyDigits` + `maxLength` in the two screen components). Any future caller of `usePinGate()` that doesn't route through those exact input components (or a UI bug that lets the restriction slip) could silently persist a malformed PIN with no defense at the module boundary. `PIN_LENGTH = 6` is also independently redeclared in both `pin-gate-screen.tsx` and `pin-security.tsx` rather than exported from one source, so the two copies could drift apart.
- **Fix**: Validate `/^\d{6}$/.test(pin)` inside `setPin`/`changePin` (and the comparison target inside `unlock`) using one `PIN_LENGTH` constant exported from `pin-gate.tsx`, so the invariant holds regardless of caller.
- **Decision**: FIXED

### F4 — "Lock now" is fire-and-forget, breaking this screen's own error-surfacing convention

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/(profile)/index.tsx:219 (`<Pressable onPress={() => lock()} ...>`)
- **Detail**: Every other mutation on this screen surfaces failure to the user — `upsert.isError` (116-120) and, in the sibling `weight.tsx`, `create.isError`/`deleteWeight.isError` each render a "Couldn't … Try again." message. The new `lock()` call has no pending state and no error branch; if the underlying `AsyncStorage.setItem` throws, it's an unhandled rejection and the button silently does nothing, breaking this file's own established convention.
- **Fix**: Wrap the call in a small async handler with try/catch and a short inline error message, consistent with the rest of the screen.
- **Decision**: FIXED

### F5 — `lock()` is `Promise<void>`, not the `void` the plan's Contract specifies

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/pin-gate.tsx:97-102 vs plan.md:82
- **Detail**: The plan's Phase 1 Contract lists `lock(): void` (synchronous), but the implementation returns `Promise<void>` (it awaits the AsyncStorage write before resolving). The only caller (`(profile)/index.tsx:219`) doesn't await it, so this doesn't break anything today — it's a wording deviation, not a functional one, and arguably more honest than the plan's literal signature since the write genuinely is async.
- **Fix**: No code change needed — update the plan's Contract text to `lock(): Promise<void>` for accuracy.
- **Decision**: FIXED

### F6 — Submit buttons enable on length, not on new/confirm equality

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/pin-gate-screen.tsx:30 (`PinSetup.canSubmit`), src/app/(profile)/pin-security.tsx:26-30 (`canSubmit`)
- **Detail**: The plan's Phase 3 Contract says new-PIN and confirmation "must match before submission is enabled." Both the Phase 2 setup screen and the Phase 3 change-PIN screen instead enable the button once fields are the right length, checking equality only inside `onSubmit` and showing an inline error on mismatch. The two screens are internally consistent with each other, and the end-user outcome is equivalent — a mismatched PIN never succeeds — so this is a wording-precision drift, not a functional gap.
- **Fix**: No code change needed — update the plan's Contract wording to describe validate-on-submit, or disable the button pre-submit later if the literal behavior is preferred.
- **Decision**: FIXED

### F7 — No guard against calling unlock/lock/changePin before the initial read resolves

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/lib/pin-gate.tsx:87-114
- **Detail**: `unlock`, `lock`, and `changePin` have no internal guard against being called while `record` is still `null` because the initial AsyncStorage read hasn't resolved. Currently safe only because the sole consumer (`_layout.tsx:46`, `if (loading) return null;`) never renders anything that could call these before `loading` is `false`. Not exploitable today, but the invariant isn't defended at the module boundary itself.
- **Fix**: Low priority — no immediate action needed; if a new consumer is ever added outside the current gating, add an explicit guard.
- **Decision**: FIXED — added `loading` guards to `setPin`/`unlock`/`lock`/`changePin`/`clearPin` in `src/lib/pin-gate.tsx`.

### F8 — Single-round SHA-256 for a 6-digit PIN

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/pin-crypto.ts:15-17
- **Detail**: `hashPin` does a single round of SHA-256 over `salt + pin`. The random per-record salt prevents rainbow-table reuse across stored PINs, but a 6-digit PIN has only 10^6 possibilities, and unstretched SHA-256 makes brute-forcing a single stolen `{hash, salt}` pair fast. This is explicitly acceptable given the product's own framing — the PIN is a convenience gate, not the real security boundary (the Supabase credential is), and anyone who can read the app's AsyncStorage already has the device. Flagging for the record only.
- **Fix**: None — consistent with the documented product scope.
- **Decision**: FIXED — added 1,000-round iterated hashing to `hashPin` in `src/lib/pin-crypto.ts`, per user's explicit round-count decision.
