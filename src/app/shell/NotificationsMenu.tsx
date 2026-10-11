/**
 * Notifications: real, permission-checked items only —
 *   - server-generated collaboration activity (new shared pins, meetups
 *     planned / rescheduled / cancelled, someone joining your meetup),
 *     delivered live via Realtime; clicking opens the pin on its map;
 *   - pending collaboration invitations (accept/decline in place);
 *   - incoming friend requests.
 * Guests have no server-side notifications; the menu says so.
 */
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Crown, CalendarClock, CalendarX, MapPin, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../AuthProvider';
import { Popover } from '@/components/ui/Popover';
import { formatRelative } from '@/lib/format';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { useMyPendingInvitations } from '@/features/collaboration/api';
import { PendingInvites } from '@/features/collaboration/CollabPanel';
import { useFriendships } from '@/features/friends/api';
import { useMarkNotificationsRead, useNotifications, type NotificationKind } from '@/features/collaboration/notifications';
import { sharedPinLink } from '@/lib/shareLinks';

const ICON: Record<NotificationKind, typeof Bell> = {
  shared_pin_added: MapPin, meetup_created: Users, meetup_rescheduled: CalendarClock, meetup_cancelled: CalendarX, meetup_joined: UserPlus,
  chess_challenge: Crown, chess_accepted: Crown, chess_your_turn: Crown, chess_finished: Crown,
};

export function NotificationsMenu() {
  const { user } = useAuth();
  const ws = useWorkspace();
  const navigate = useNavigate();
  const signedIn = !!user && !ws.local;
  const invites = useMyPendingInvitations();
  const friends = useFriendships();
  const notes = useNotifications();
  const markRead = useMarkNotificationsRead();
  const requests = signedIn ? (friends.data ?? []).filter((f) => f.status === 'pending' && !f.outgoing) : [];
  const unread = (notes.data ?? []).filter((n) => !n.readAt);
  const count = signedIn ? (invites.data?.length ?? 0) + requests.length + unread.length : 0;
  const label = count ? `Notifications (${count} new)` : 'Notifications';

  return (
    <Popover label="Notifications" trigger={({ open, toggle, id }) => (
      <button type="button" aria-expanded={open} aria-controls={id} onClick={toggle} aria-label={label} title={label}
        className="relative grid size-9 place-items-center rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900">
        <Bell className="size-[18px]" aria-hidden />
        {count > 0 && <span aria-hidden className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white">{count > 9 ? '9+' : count}</span>}
      </button>
    )}>
      {(close) => (
        <div className="w-[340px] space-y-2 p-3 text-sm">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold">Notifications</h2>
            {unread.length > 0 && <button type="button" className="text-xs text-accent underline" onClick={() => markRead.mutate(unread.map((n) => n.id))}>Mark all read</button>}
          </div>
          {!signedIn ? (
            <p className="px-1 text-xs text-neutral-600">Collaboration activity, invitations and friend requests appear here when you’re signed in. {ws.mode === 'guest' && <Link to="/auth" onClick={close} className="underline">Sign in</Link>}</p>
          ) : (
            <>
              {!!invites.data?.length && <PendingInvites />}
              {requests.length > 0 && (
                <section aria-label="Friend requests" className="rounded-xl bg-canvas p-2">
                  <h3 className="flex items-center gap-1.5 px-1 pb-1 text-xs font-semibold"><UserPlus className="size-3.5" aria-hidden />Friend requests</h3>
                  <ul className="space-y-1">
                    {requests.map((r) => (
                      <li key={r.id} className="rounded-lg bg-white px-2 py-1.5 text-sm"><span className="font-medium">{r.other?.displayName || r.other?.username || 'Someone'}</span> wants to be friends.</li>
                    ))}
                  </ul>
                  <Link to="/settings/friends" onClick={close} className="mt-1 block px-1 text-xs font-medium text-brand underline">Review in Settings → Friends</Link>
                </section>
              )}
              {(notes.data ?? []).length > 0 ? (
                <ul aria-label="Activity" className="max-h-80 space-y-0.5 overflow-y-auto">
                  {notes.data!.map((n) => {
                    const Icon = ICON[n.kind];
                    return (
                      <li key={n.id}>
                        <button type="button" className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-neutral-100 ${n.readAt ? 'text-neutral-600' : 'text-neutral-900'}`}
                          onClick={() => {
                            if (!n.readAt) markRead.mutate([n.id]);
                            close();
                            if (n.chessGameId) navigate(`/chess/${n.chessGameId}`);
                            else if (n.collabMapId && n.sharedPinId) navigate(new URL(sharedPinLink(n.collabMapId, n.sharedPinId)).pathname + `?pin=${n.sharedPinId}`);
                            else if (n.collabMapId) navigate(`/collab/${n.collabMapId}`);
                          }}>
                          <Icon className="mt-0.5 size-4 shrink-0 text-neutral-500" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className={`block text-[13px] ${n.readAt ? '' : 'font-medium'}`}>{n.kind === 'shared_pin_added' ? `${n.actorName ?? 'Someone'} added “${n.title}”` : n.title}</span>
                            <span className="text-[11px] text-neutral-500">{n.kind !== 'shared_pin_added' && n.actorName ? `${n.actorName} · ` : ''}{formatRelative(n.createdAt)}</span>
                          </span>
                          {!n.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" aria-label="unread" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : !invites.data?.length && requests.length === 0 && <p className="px-1 text-xs text-neutral-600">You’re all caught up.</p>}
            </>
          )}
        </div>
      )}
    </Popover>
  );
}
