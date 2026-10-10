/**
 * Guard for account-only routes (real collaboration maps, invitations, friend
 * links). Guests get a friendly explanation instead of an auth wall; their
 * local workspace is untouched. This is UX only — data access is enforced by
 * RLS regardless of what the UI renders.
 */
import type { ReactNode } from 'react';
import { useAuth } from './AuthProvider';
import { Spinner } from '@/components/ui/Feedback';
import { AccountRequiredCard, type AccountReason } from '@/features/workspace/AccountRequired';

export function RequireAuth({ children, reason = 'collaboration' }: { children: ReactNode; reason?: AccountReason }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="absolute left-1/2 top-20 z-20 -translate-x-1/2 rounded-xl bg-white px-4 py-2 shadow-panel"><Spinner label="Checking your session" /></div>;
  if (!user) {
    return (
      <div className="absolute inset-0 z-20 grid place-items-center bg-neutral-900/15 p-6">
        <div className="w-[440px]"><AccountRequiredCard reason={reason} /></div>
      </div>
    );
  }
  return <>{children}</>;
}
