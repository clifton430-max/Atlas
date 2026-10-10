/**
 * Workspace selection — WHERE personal data lives for the current session:
 *
 *   'account' : signed in -> Supabase (RLS-protected). Unchanged behaviour.
 *   'guest'   : not signed in -> LocalWorkspace('atlas.guest.v1') on this device.
 *   'sandbox' : the interactive tutorial is running -> a disposable
 *               LocalWorkspace('atlas.sandbox.v1'), for guests AND signed-in
 *               users, so the tour can never modify real or guest data.
 *
 * Data hooks read `scope` and include it in every query key, so cached data
 * from one workspace can never be shown in another. Local workspaces never
 * talk to Supabase; nothing is uploaded unless the user explicitly imports.
 */
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/AuthProvider';
import { useTutorial } from '@/features/tutorial/tutorialStore';
import { LocalWorkspace } from './localWorkspace';

export type WorkspaceMode = 'account' | 'guest' | 'sandbox';

export interface WorkspaceValue {
  mode: WorkspaceMode;
  /** Query-key scope, e.g. 'account:<uid>' | 'guest' | 'sandbox'. */
  scope: string;
  /** The local store for guest/sandbox modes; null in account mode. */
  local: LocalWorkspace | null;
  /** True when data is stored on this device rather than in an account. */
  isLocal: boolean;
}

let guestWs: LocalWorkspace | null = null;
let sandboxWs: LocalWorkspace | null = null;
export function getGuestWorkspace(): LocalWorkspace {
  if (!guestWs) {
    guestWs = new LocalWorkspace('atlas.guest.v1');
    // First visit: give guests a ready-to-use map, like new accounts get.
    if (guestWs.wasNew) {
      try { guestWs.createMap({ name: 'My Map' }); } catch { /* storage unavailable: user can create one */ }
    }
  }
  return guestWs;
}
export const getSandboxWorkspace = () => (sandboxWs ??= new LocalWorkspace('atlas.sandbox.v1'));
/** Test helper: drop singletons so a fresh instance re-reads storage. */
export function __resetWorkspacesForTests() {
  guestWs = null;
  sandboxWs = null;
}

const Ctx = createContext<WorkspaceValue>({ mode: 'guest', scope: 'guest', local: null, isLocal: true });

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const tourActive = useTutorial((s) => s.active);
  const qc = useQueryClient();

  const value = useMemo<WorkspaceValue>(() => {
    if (tourActive) return { mode: 'sandbox', scope: 'sandbox', local: getSandboxWorkspace(), isLocal: true };
    if (user) return { mode: 'account', scope: `account:${user.id}`, local: null, isLocal: false };
    return { mode: 'guest', scope: loading ? 'pending' : 'guest', local: getGuestWorkspace(), isLocal: true };
  }, [tourActive, user, loading]);

  // Keep cached local queries in sync with the store (including other tabs).
  useEffect(() => {
    const ws = value.local;
    if (!ws) return;
    const unsub = ws.subscribe(() => qc.invalidateQueries({ predicate: (q) => q.queryKey.includes(value.scope) }));
    const onStorage = (e: StorageEvent) => { if (e.key === ws.storageKey) ws.reload(); };
    window.addEventListener('storage', onStorage);
    return () => {
      unsub();
      window.removeEventListener('storage', onStorage);
    };
  }, [value, qc]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useWorkspace = () => useContext(Ctx);
