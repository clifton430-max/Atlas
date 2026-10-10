/**
 * Authentication session boundary. Wraps Supabase Auth and exposes the current
 * session. Authorization is NOT decided here — it is enforced by RLS/RPCs in
 * the database; this only tells the UI who is signed in.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { initialPasswordRecovery, supabase } from '@/lib/supabase';
import { isSupabaseConfigured } from '@/lib/env';

interface AuthState {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  /** Set when the user arrived via a password-recovery link. */
  recovering: boolean;
}

const AuthContext = createContext<AuthState>({
  configured: false, loading: false, session: null, user: null, recovering: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [state, setState] = useState<AuthState>({
    configured: isSupabaseConfigured,
    loading: isSupabaseConfigured,
    session: null,
    user: null,
    // A recovery-link landing must show the "choose a new password" form even
    // if the PASSWORD_RECOVERY event fired before this provider subscribed.
    recovering: isSupabaseConfigured && initialPasswordRecovery,
  });

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setState((s) => ({ ...s, loading: false, session: data.session, user: data.session?.user ?? null }));
    }).catch(() => {
      if (active) setState((s) => ({ ...s, loading: false }));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setState((s) => ({
        ...s,
        loading: false,
        session,
        user: session?.user ?? null,
        recovering: event === 'PASSWORD_RECOVERY' ? true : event === 'SIGNED_OUT' ? false : s.recovering,
      }));
      // Never let one user's cached private data survive a user switch.
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') {
        qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'events' });
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [qc]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
