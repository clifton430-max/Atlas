/**
 * Friendships. All transitions run through SECURITY DEFINER RPCs that
 * implement the request state machine; clients have read-only access to
 * their own friendship rows. Friendship never grants map or pin access.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requireSupabase, unwrap } from '@/lib/supabase';
import { qk } from '@/lib/queryClient';
import type { Friendship } from '@/lib/types';
import { useAuth } from '@/app/AuthProvider';

type Row = Record<string, unknown>;
const PROFILE_EMBED = 'id, username, display_name';

export function useFriendships() {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.friendships,
    enabled: !!user,
    queryFn: async () => {
      const rows = unwrap(await requireSupabase().from('friendships').select(`id, status, requester_id, addressee_id, created_at,
        requester:profiles!friendships_requester_id_fkey(${PROFILE_EMBED}),
        addressee:profiles!friendships_addressee_id_fkey(${PROFILE_EMBED})`).order('updated_at', { ascending: false }));
      return (rows as Row[]).map((r): Friendship => {
        const outgoing = r.requester_id === user!.id;
        const other = (outgoing ? r.addressee : r.requester) as Row | null;
        return {
          id: String(r.id), status: r.status as Friendship['status'], outgoing,
          other: other ? { id: String(other.id), username: String(other.username), displayName: String(other.display_name ?? '') } : null,
          createdAt: String(r.created_at),
        };
      });
    },
  });
}

export async function searchProfiles(query: string, excludeId: string) {
  // Only allow characters valid in usernames/display names to avoid filter-syntax injection.
  const q = query.toLowerCase().replace(/[^a-z0-9_ ]/g, '').trim();
  if (q.length < 2) return [];
  const rows = unwrap(await requireSupabase().from('profiles').select(PROFILE_EMBED)
    .or(`username.ilike.${q}%,display_name.ilike.%${q}%`).neq('id', excludeId).limit(10));
  return (rows as Row[]).map((r) => ({ id: String(r.id), username: String(r.username), displayName: String(r.display_name ?? '') }));
}

export async function getMyFriendCode(): Promise<string> {
  return unwrap(await requireSupabase().rpc('get_my_friend_code')) as string;
}

export async function findProfileByCode(code: string) {
  const rows = unwrap(await requireSupabase().rpc('find_profile_by_friend_code', { p_code: code })) as Row[];
  const r = rows?.[0];
  return r ? { id: String(r.id), username: String(r.username), displayName: String(r.display_name ?? '') } : null;
}

export function friendLinkUrl(code: string) {
  return `${window.location.origin}/friend/${encodeURIComponent(code)}`;
}

export function useFriendMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.friendships });
  const sb = () => requireSupabase();
  return {
    request: useMutation({
      mutationFn: async (targetId: string) => unwrap(await sb().rpc('send_friend_request', { p_target: targetId })),
      onSuccess: invalidate,
    }),
    requestByCode: useMutation({
      mutationFn: async (code: string) => unwrap(await sb().rpc('send_friend_request_by_code', { p_code: code })),
      onSuccess: invalidate,
    }),
    respond: useMutation({
      mutationFn: async (input: { id: string; accept: boolean }) =>
        unwrap(await sb().rpc('respond_friend_request', { p_friendship_id: input.id, p_accept: input.accept })),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => unwrap(await sb().rpc('remove_friendship', { p_friendship_id: id })),
      onSuccess: invalidate,
    }),
    regenerateCode: useMutation({
      mutationFn: async () => unwrap(await sb().rpc('regenerate_friend_code')) as string,
    }),
  };
}
