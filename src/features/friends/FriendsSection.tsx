/**
 * Friends: search discoverable users, send/accept/decline/cancel requests,
 * and remove friends. All state changes go through RPCs that enforce the
 * request state machine server-side.
 */
import { useEffect, useState } from 'react';
import { Search, UserPlus } from 'lucide-react';
import { useAuth } from '@/app/AuthProvider';
import { useDebounced } from '@/lib/useDebounced';
import type { Friendship } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorMessage, Spinner } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { searchProfiles, useFriendMutations, useFriendships } from './api';

export function FriendsSection() {
  const { user } = useAuth();
  const toast = useToast();
  const friendships = useFriendships();
  const m = useFriendMutations();
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 300);
  const [results, setResults] = useState<{ id: string; username: string; displayName: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<unknown>(null);

  useEffect(() => {
    if (!user || dq.trim().length < 2) { setResults([]); return; }
    let active = true;
    setSearching(true);
    searchProfiles(dq, user.id)
      .then((r) => active && (setResults(r), setSearchError(null)))
      .catch((e) => active && setSearchError(e))
      .finally(() => active && setSearching(false));
    return () => { active = false; };
  }, [dq, user]);

  const list = friendships.data ?? [];
  const incoming = list.filter((f) => f.status === 'pending' && !f.outgoing);
  const outgoing = list.filter((f) => f.status === 'pending' && f.outgoing);
  const friends = list.filter((f) => f.status === 'accepted');
  const relation = (id: string) => list.find((f) => f.other?.id === id);
  const done = (msg: string) => ({ onSuccess: () => toast.success(msg), onError: (e: unknown) => toast.error(e) });

  return (
    <div className="max-w-xl space-y-8">
      <header className="pr-10">
        <h2 className="text-lg font-semibold">Friends</h2>
        <p className="mt-0.5 text-sm text-neutral-500">Friends can be invited directly to collaboration maps. Friendship never shares your maps or pins.</p>
      </header>

      <section aria-labelledby="find-heading">
        <h3 id="find-heading" className="mb-2 text-sm font-semibold">Find people</h3>
        <label className="flex h-9 items-center gap-2 rounded-lg border border-neutral-300 px-3 focus-within:border-accent">
          <Search className="size-4 text-neutral-400" aria-hidden />
          <span className="sr-only">Search by username or name</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by username or name" className="h-full flex-1 bg-transparent text-sm outline-none" />
        </label>
        <div className="mt-2" aria-live="polite">
          {searching ? <Spinner /> : searchError ? <ErrorMessage error={searchError} /> : dq.length >= 2 && results.length === 0 ? (
            <p className="text-xs text-neutral-500">No discoverable users match. People who hide their profile can share a friend link instead.</p>
          ) : (
            <ul className="space-y-1">
              {results.map((r) => {
                const rel = relation(r.id);
                return (
                  <li key={r.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-neutral-50">
                    <span className="flex-1">{r.displayName || r.username} <span className="text-neutral-500">@{r.username}</span></span>
                    {rel?.status === 'accepted' ? <span className="text-xs text-neutral-500">Friends</span>
                      : rel?.status === 'pending' && rel.outgoing ? <span className="text-xs text-neutral-500">Requested</span>
                      : (
                        <Button size="sm" icon={<UserPlus className="size-3.5" aria-hidden />} loading={m.request.isPending && m.request.variables === r.id}
                          onClick={() => m.request.mutate(r.id, done(rel?.status === 'pending' ? 'You are now friends.' : 'Friend request sent.'))}>
                          {rel?.status === 'pending' ? 'Accept' : 'Add friend'}
                        </Button>
                      )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {friendships.isLoading ? <Spinner /> : friendships.error ? <ErrorMessage error={friendships.error} /> : (
        <>
          {incoming.length > 0 && (
            <FriendList title="Requests for you" items={incoming} actions={(f) => (
              <>
                <Button size="sm" variant="primary" onClick={() => m.respond.mutate({ id: f.id, accept: true }, done('Friend request accepted.'))}>Accept</Button>
                <Button size="sm" variant="ghost" onClick={() => m.respond.mutate({ id: f.id, accept: false }, done('Request declined.'))}>Decline</Button>
              </>
            )} />
          )}
          {outgoing.length > 0 && (
            <FriendList title="Sent requests" items={outgoing} actions={(f) => (
              <Button size="sm" variant="ghost" onClick={() => m.remove.mutate(f.id, done('Request cancelled.'))}>Cancel</Button>
            )} />
          )}
          {friends.length > 0 ? (
            <FriendList title={`Friends (${friends.length})`} items={friends} actions={(f) => (
              <Button size="sm" variant="ghost" className="text-danger" onClick={() => m.remove.mutate(f.id, done('Friend removed.'))}>Remove</Button>
            )} />
          ) : <EmptyState title="No friends yet">Search above or share your friend link from Privacy settings.</EmptyState>}
        </>
      )}
    </div>
  );
}

function FriendList({ title, items, actions }: { title: string; items: Friendship[]; actions: (f: Friendship) => React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <ul className="divide-y divide-neutral-100 rounded-xl ring-1 ring-neutral-200">
        {items.map((f) => (
          <li key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm">
            <span className="flex-1">{f.other?.displayName || f.other?.username || 'Unknown user'} {f.other && <span className="text-neutral-500">@{f.other.username}</span>}</span>
            {actions(f)}
          </li>
        ))}
      </ul>
    </section>
  );
}
