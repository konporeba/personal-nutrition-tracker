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

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
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
