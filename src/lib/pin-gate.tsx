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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { generateSalt, hashPin } from '@/lib/pin-crypto';

const STORAGE_KEY = '@caltracker/pin-gate';

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
  /** Verifies `pin` against the stored hash; unlocks and returns true on match. */
  unlock: (pin: string) => Promise<boolean>;
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
    const salt = await generateSalt();
    const hash = await hashPin(pin, salt);
    const next: PinRecord = { hash, salt, unlocked: true };
    await writeRecord(next);
    setRecord(next);
  }

  async function unlock(pin: string): Promise<boolean> {
    if (!record) return false;
    const candidate = await hashPin(pin, record.salt);
    if (candidate !== record.hash) return false;
    const next: PinRecord = { ...record, unlocked: true };
    await writeRecord(next);
    setRecord(next);
    return true;
  }

  async function lock(): Promise<void> {
    if (!record) return;
    const next: PinRecord = { ...record, unlocked: false };
    await writeRecord(next);
    setRecord(next);
  }

  async function changePin(currentPin: string, nextPin: string): Promise<boolean> {
    if (!record) return false;
    const candidate = await hashPin(currentPin, record.salt);
    if (candidate !== record.hash) return false;
    const salt = await generateSalt();
    const hash = await hashPin(nextPin, salt);
    const next: PinRecord = { hash, salt, unlocked: true };
    await writeRecord(next);
    setRecord(next);
    return true;
  }

  async function clearPin(): Promise<void> {
    await writeRecord(null);
    setRecord(null);
  }

  const state: PinGateState = {
    loading,
    hasPinSet: record !== null,
    unlocked: record?.unlocked ?? false,
    setPin,
    unlock,
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
