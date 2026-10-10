/**
 * Route guard for signed-in areas. This is a UX convenience only — data
 * access is protected by RLS regardless of what the UI renders.
 */
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { Spinner, Notice } from '@/components/ui/Feedback';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, configured } = useAuth();
  const loc = useLocation();
  if (!configured) {
    return (
      <div className="absolute left-1/2 top-20 z-20 w-[420px] -translate-x-1/2">
        <Notice tone="warning">This area needs a configured Supabase project (see README). Discover works with development sample data.</Notice>
      </div>
    );
  }
  if (loading) return <div className="absolute left-1/2 top-20 z-20 -translate-x-1/2 rounded-xl bg-white px-4 py-2 shadow-panel"><Spinner label="Checking your session" /></div>;
  if (!user) return <Navigate to={`/auth?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <>{children}</>;
}
