// Device-local PIN gate (S-12, FR-042). Sits on top of the owner-session seam
// (see session.ts) — a live Supabase session is required, but daily access is
// additionally gated by a per-device PIN stored here. This is the codebase's
// first Context: unlike session state (consumed once at the root), `lock()`
// and `changePin()` must be callable from deep inside the Profile tab.
//
// `unlocked` is persisted alongside the hash/salt, not just held in React
// state — the chosen UX is "stays unlocked across restarts until manually
// locked," so an in-memory-only flag would silently re-lock on every
// force-quit.
//
// The PIN also carries the owner's credentials, sealed under it — see
// `credential-vault.ts` for why and at what cost. Everything that creates,
// changes or clears a PIN has to move that seal in step, which is why those
// three functions all touch the vault below.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { clearVault, openVault, sealVault, takeRememberedCredentials } from '@/lib/credential-vault';
import { generateSalt, hashPin } from '@/lib/pin-crypto';

const STORAGE_KEY = '@caltracker/pin-gate';

export const PIN_LENGTH = 6;
const PIN_PATTERN = new RegExp(`^\\d{${PIN_LENGTH}}$`);

/** Enforced here too, not just in the UI's maxLength/onlyDigits — the state layer shouldn't trust callers to have filtered input. */
function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

type PinRecord = {
  hash: string;
  salt: string;
  unlocked: boolean;
};

export type PinGateState = {
  /** True until the persisted PIN record has been read. Gate render on !loading. */
  loading: boolean;
  hasPinSet: boolean;
  unlocked: boolean;
  /** First-run creation: hashes and persists `pin`, unlocking immediately. */
  setPin: (pin: string) => Promise<void>;
  /**
   * Checks `pin` against the stored hash without unlocking anything.
   *
   * Split from `markUnlocked` because a correct PIN is no longer the last step
   * of getting in: when the account session has lapsed, the gate has to mint a
   * new one from the sealed credentials *before* it flips the flag. Flipping
   * first would swap the gate out for an app with no session behind it.
   */
  verify: (pin: string) => Promise<boolean>;
  /** Records the device as unlocked. Only call after `verify` has passed. */
  markUnlocked: () => Promise<void>;
  /** Re-seals the stored credentials under `pin`. For the one-time link-up of a
   *  device whose PIN predates the vault — `verify` must have passed first. */
  sealCredentials: (pin: string, email: string, password: string) => Promise<void>;
  lock: () => Promise<void>;
  /** Verifies `currentPin`, then hashes and persists `nextPin`. False on mismatch. */
  changePin: (currentPin: string, nextPin: string) => Promise<boolean>;
  /** Wipes the stored PIN record entirely. Used only by forgot-PIN recovery. */
  clearPin: () => Promise<void>;
};

const PinGateContext = createContext<PinGateState | null>(null);

async function readRecord(): Promise<PinRecord | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as PinRecord) : null;
}

async function writeRecord(record: PinRecord | null): Promise<void> {
  if (record === null) {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } else {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  }
}

export function PinGateProvider({ children }: { children: ReactNode }) {
  const [record, setRecord] = useState<PinRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    readRecord()
      .then((stored) => {
        if (mounted) setRecord(stored);
      })
      .catch(() => {
        // No stored record readable — fall through to setup mode rather than
        // stranding the app.
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  async function setPin(pin: string): Promise<void> {
    // Guard against a caller racing the initial AsyncStorage read: writing
    // here while `loading` is still true would get silently clobbered once
    // that read resolves and calls setRecord with whatever was there before.
    if (loading) throw new Error('PIN gate not ready yet');
    if (!isValidPin(pin)) throw new Error(`PIN must be ${PIN_LENGTH} digits`);
    const salt = await generateSalt();
    const hash = await hashPin(pin, salt);
    const next: PinRecord = { hash, salt, unlocked: true };
    await writeRecord(next);
    setRecord(next);
    // Seal whatever credentials got us here, so this PIN can mint a session on
    // its own next launch. Nothing parked means the owner reached this screen
    // on an already-live session (recovery, or a PIN set long after sign-in) —
    // the gate handles that by asking for the account once, later.
    const credentials = takeRememberedCredentials();
    if (credentials) await sealVault(pin, credentials);
  }

  async function verify(pin: string): Promise<boolean> {
    if (loading || !record || !isValidPin(pin)) return false;
    return (await hashPin(pin, record.salt)) === record.hash;
  }

  async function markUnlocked(): Promise<void> {
    if (loading || !record || record.unlocked) return;
    const next: PinRecord = { ...record, unlocked: true };
    await writeRecord(next);
    setRecord(next);
  }

  async function sealCredentials(pin: string, email: string, password: string): Promise<void> {
    await sealVault(pin, { email, password });
  }

  async function lock(): Promise<void> {
    if (loading || !record) return;
    const next: PinRecord = { ...record, unlocked: false };
    await writeRecord(next);
    setRecord(next);
  }

  async function changePin(currentPin: string, nextPin: string): Promise<boolean> {
    if (loading || !record) return false;
    if (!isValidPin(nextPin)) throw new Error(`PIN must be ${PIN_LENGTH} digits`);
    const candidate = await hashPin(currentPin, record.salt);
    if (candidate !== record.hash) return false;
    // Move the sealed credentials across to the new PIN before the old one
    // stops being able to open them. Skipped when there is nothing sealed —
    // changing the PIN is not the moment to start asking for a password.
    const credentials = await openVault(currentPin);
    const salt = await generateSalt();
    const hash = await hashPin(nextPin, salt);
    const next: PinRecord = { hash, salt, unlocked: true };
    await writeRecord(next);
    setRecord(next);
    if (credentials) await sealVault(nextPin, credentials);
    return true;
  }

  async function clearPin(): Promise<void> {
    if (loading) return;
    // The vault goes with the PIN: it is unreadable without one, and leaving it
    // behind would let a new PIN inherit the old device's account.
    await clearVault();
    await writeRecord(null);
    setRecord(null);
  }

  const state: PinGateState = {
    loading,
    hasPinSet: record !== null,
    unlocked: record?.unlocked ?? false,
    setPin,
    verify,
    markUnlocked,
    sealCredentials,
    lock,
    changePin,
    clearPin,
  };

  return <PinGateContext.Provider value={state}>{children}</PinGateContext.Provider>;
}

export function usePinGate(): PinGateState {
  const ctx = useContext(PinGateContext);
  if (!ctx) throw new Error('usePinGate must be used within a PinGateProvider');
  return ctx;
}
