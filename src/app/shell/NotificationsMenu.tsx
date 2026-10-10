/**
 * Notifications: real, actionable items only — pending collaboration
 * invitations (accept/decline in place) and incoming friend requests.
 * Guests have no server-side notifications; the menu says so.
 */
import { Link } from 'react-router-dom';
import { Bell, UserPlus } from 'lucide-react';
import { useAuth } from '../AuthProvider';
import { Popover } from '@/components/ui/Popover';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { useMyPendingInvitations } from '@/features/collaboration/api';
import { PendingInvites } from '@/features/collaboration/CollabPanel';
import { useFriendships } from '@/features/friends/api';

export function NotificationsMenu() {
  const { user } = useAuth();
  const ws = useWorkspace();
  const signedIn = !!user && !ws.local;
  const invites = useMyPendingInvitations();
  const friends = useFriendships();
  const requests = signedIn ? (friends.data ?? []).filter((f) => f.status === 'pending' && !f.outgoing) : [];
  const count = signedIn ? (invites.data?.length ?? 0) + requests.length : 0;
  const label = count ? `Notifications (${count} new)` : 'Notifications';

  return (
    <Popover label="Notifications" trigger={({ open, toggle, id }) => (
      <button type="button" aria-expanded={open} aria-controls={id} onClick={toggle} aria-label={label} title={label}
        className="relative grid size-9 place-items-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900">
        <Bell className="size-[18px]" aria-hidden />
        {count > 0 && <span aria-hidden className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white">{count}</span>}
      </button>
    )}>
      {(close) => (
        <div className="w-80 space-y-2 p-3 text-sm">
          <h2 className="px-1 text-sm font-semibold">Notifications</h2>
          {!signedIn ? (
            <p className="px-1 text-xs text-neutral-600">Invitations and friend requests appear here when you’re signed in. {ws.mode === 'guest' && <Link to="/auth" onClick={close} className="underline">Sign in</Link>}</p>
          ) : count === 0 ? (
            <p className="px-1 text-xs text-neutral-600">You’re all caught up.</p>
          ) : (
            <>
              {!!invites.data?.length && <PendingInvites />}
              {requests.length > 0 && (
                <section aria-label="Friend requests" className="rounded-xl bg-canvas p-2">
                  <h3 className="flex items-center gap-1.5 px-1 pb-1 text-xs font-semibold"><UserPlus className="size-3.5" aria-hidden />Friend requests</h3>
                  <ul className="space-y-1">
                    {requests.map((r) => (
                      <li key={r.id} className="rounded-lg bg-white px-2 py-1.5 text-sm">
                        <span className="font-medium">{r.other?.displayName || r.other?.username || 'Someone'}</span> wants to be friends.
                      </li>
                    ))}
                  </ul>
                  <Link to="/settings/friends" onClick={close} className="mt-1 block px-1 text-xs font-medium text-brand underline">Review in Settings → Friends</Link>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </Popover>
  );
}
