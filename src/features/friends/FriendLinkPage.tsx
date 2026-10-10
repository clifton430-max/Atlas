/**
 * /friend/:code — resolves a friend link / QR code to a profile and lets the
 * visitor send a friend request. Becoming friends grants no map access.
 */
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { useAuth } from '@/app/AuthProvider';
import { Button } from '@/components/ui/Button';
import { ErrorMessage, Spinner } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { findProfileByCode, useFriendMutations, useFriendships } from './api';

export function FriendLinkPage() {
  const { code = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const profile = useQuery({ queryKey: ['friendCode', code], queryFn: () => findProfileByCode(code), retry: 0 });
  const friendships = useFriendships();
  const { requestByCode } = useFriendMutations();
  const p = profile.data;
  const existing = friendships.data?.find((f) => f.other?.id === p?.id);

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-neutral-900/20 p-6">
      <section aria-labelledby="friend-title" className="w-[400px] rounded-2xl bg-white p-6 shadow-float">
        <div className="mb-3 grid size-10 place-items-center rounded-xl bg-neutral-100"><UserPlus className="size-5" aria-hidden /></div>
        <h1 id="friend-title" className="text-lg font-semibold">Friend link</h1>
        {profile.isLoading ? <Spinner className="mt-4" /> : profile.error ? <ErrorMessage className="mt-4" error={profile.error} /> : !p ? (
          <p className="mt-2 text-sm text-neutral-700" role="alert">This friend link is invalid or has been reset.</p>
        ) : p.id === user?.id ? (
          <p className="mt-2 text-sm text-neutral-700">This is your own friend link. Share it with people you want to connect with.</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-neutral-700"><strong>{p.displayName || p.username}</strong> <span className="text-neutral-500">@{p.username}</span></p>
            <p className="mt-1 text-xs text-neutral-500">Friends can invite each other to collaboration maps. Friendship never gives access to private maps or pins.</p>
            {existing?.status === 'accepted' ? <p className="mt-4 text-sm">You’re already friends.</p>
              : existing?.status === 'pending' && existing.outgoing ? <p className="mt-4 text-sm">Request sent — waiting for them to accept.</p>
              : null}
            <ErrorMessage className="mt-3" error={requestByCode.error} />
          </>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => navigate('/')}>Close</Button>
          {p && p.id !== user?.id && existing?.status !== 'accepted' && !(existing?.status === 'pending' && existing.outgoing) && (
            <Button variant="primary" loading={requestByCode.isPending} onClick={() => requestByCode.mutate(code, {
              onSuccess: () => toast.success(existing?.status === 'pending' ? 'You are now friends.' : 'Friend request sent.'),
            })}>
              {existing?.status === 'pending' ? 'Accept their request' : 'Send friend request'}
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
