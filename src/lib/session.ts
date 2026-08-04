// Owner session bootstrap. The app runs inside a single authenticated owner
// session obtained by a one-time sign-in (see components/owner-sign-in.tsx),
// whose token is then persisted by the Supabase client (lib/supabase[.web].ts).
// Daily access is gated by the S-12 PIN, which will sit on top of this seam.
import { useEffect, useState } from 'react';

import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

export type OwnerSessionState = {
  session: Session | null;
  /** True until the initial getSession() resolves. Gate app render on !loading. */
  loading: boolean;
};

/** Resolves the persisted session on launch and tracks sign-in/sign-out. */
export function useOwnerSession(): OwnerSessionState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session);
        setLoading(false);
      })
      .catch(() => {
        // Don't strand the app on the splash if session lookup fails —
        // fall through to the sign-in screen.
        if (mounted) setLoading(false);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}

/** One-time owner sign-in. Throws on failure so the caller can surface the error. */
export async function signInOwner(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/**
 * Re-proves ownership *without* ending the session — the PIN gate's forgot-PIN
 * recovery. Signing in again as the account that is already signed in just
 * mints a fresh token, and a wrong password fails outright rather than
 * disturbing the session that's there, so this is a pure check.
 *
 * The recovery path used to sign out instead. That worked, but it threw the
 * owner onto the sign-in screen with nothing to go back to — the session was
 * already gone by the time they realized — and it cost a full re-auth and
 * re-sync to recover from a mistyped tap. Password re-entry proves the same
 * thing and is reversible: cancel at any point and the PIN is still set.
 *
 * `email` must be the address on the live session (the gate passes it down
 * from the session itself). Signing in as a different account here would
 * silently swap owners, so it is rejected before the call rather than after.
 */
export async function verifyOwnerPassword(email: string, password: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const current = data.session?.user.email;
  if (!current) throw new Error('No session to verify against');
  if (email.trim().toLowerCase() !== current.toLowerCase()) {
    throw new Error('That is not the account signed in on this device');
  }
  const { error } = await supabase.auth.signInWithPassword({ email: current, password });
  if (error) throw error;
}

/**
 * Signs out of the owner's Supabase session. The one way out of the app: used
 * by the PIN gate when the owner wants to hand the device on, or has lost the
 * account password as well as the PIN. Irreversible from inside the app —
 * everything after it needs the credentials again — so it is never the default
 * action on a screen.
 */
export async function signOutOwner(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
