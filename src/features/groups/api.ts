/**
 * Groups: account-level collections (owner-only RLS). Deleting a group only
 * removes memberships (pin_groups cascade); pins are never deleted or moved.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requireSupabase, unwrap } from '@/lib/supabase';
import { qk } from '@/lib/queryClient';
import type { Group } from '@/lib/types';
import { useAuth } from '@/app/AuthProvider';

const COLS = 'id, name, color, icon';
const fromRow = (r: Record<string, unknown>): Group => ({
  id: String(r.id), name: String(r.name), color: String(r.color), icon: (r.icon as string | null) ?? null,
});

export function useGroups() {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.groups,
    enabled: !!user,
    queryFn: async () => {
      const rows = unwrap(await requireSupabase().from('groups').select(COLS).order('name'));
      return (rows as Record<string, unknown>[]).map(fromRow);
    },
  });
}

export async function createGroup(input: { name: string; color: string }): Promise<Group> {
  const row = unwrap(await requireSupabase().from('groups')
    .insert({ name: input.name.trim(), color: input.color }).select(COLS).single());
  return fromRow(row as Record<string, unknown>);
}

export function useGroupMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.groups });
  return {
    create: useMutation({ mutationFn: createGroup, onSuccess: invalidate }),
    update: useMutation({
      mutationFn: async (g: { id: string; name: string; color: string }) => {
        unwrap(await requireSupabase().from('groups')
          .update({ name: g.name.trim(), color: g.color }).eq('id', g.id).select('id').single());
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        unwrap(await requireSupabase().from('groups').delete().eq('id', id).select('id').single());
      },
      onSuccess: () => {
        invalidate();
        qc.invalidateQueries({ queryKey: ['pins'] });
      },
    }),
  };
}
