/**
 * Groups: account-level collections with a color and optional icon.
 *   account mode: owner-only rows (RLS). guest/sandbox: browser-local workspace.
 * Deleting a group only removes memberships; pins are never deleted or moved.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requireSupabase, unwrap } from '@/lib/supabase';
import { qk } from '@/lib/queryClient';
import type { Group } from '@/lib/types';
import { useWorkspace, type WorkspaceValue } from '@/features/workspace/WorkspaceProvider';

const COLS = 'id, name, color, icon';
const fromRow = (r: Record<string, unknown>): Group => ({
  id: String(r.id), name: String(r.name), color: String(r.color), icon: (r.icon as string | null) ?? null,
});

export interface GroupInput { name: string; color: string; icon?: string | null }

export function useGroups() {
  const ws = useWorkspace();
  return useQuery({
    queryKey: [...qk.groups, ws.scope],
    enabled: ws.scope !== 'pending',
    queryFn: async () => {
      if (ws.local) return ws.local.listGroups();
      const rows = unwrap(await requireSupabase().from('groups').select(COLS).order('name'));
      return (rows as Record<string, unknown>[]).map(fromRow);
    },
  });
}

/** Create a group in the given workspace. */
export async function createGroup(ws: WorkspaceValue, input: GroupInput): Promise<Group> {
  if (ws.local) return ws.local.createGroup(input);
  const row = unwrap(await requireSupabase().from('groups')
    .insert({ name: input.name.trim(), color: input.color, icon: input.icon ?? null }).select(COLS).single());
  return fromRow(row as Record<string, unknown>);
}

export function useGroupMutations() {
  const qc = useQueryClient();
  const ws = useWorkspace();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.groups });
  return {
    create: useMutation({ mutationFn: (input: GroupInput) => createGroup(ws, input), onSuccess: invalidate }),
    update: useMutation({
      mutationFn: async (g: { id: string } & GroupInput) => {
        if (ws.local) return ws.local.updateGroup(g.id, g);
        unwrap(await requireSupabase().from('groups')
          .update({ name: g.name.trim(), color: g.color, icon: g.icon ?? null }).eq('id', g.id).select('id').single());
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        if (ws.local) return ws.local.deleteGroup(id);
        unwrap(await requireSupabase().from('groups').delete().eq('id', id).select('id').single());
      },
      onSuccess: () => {
        invalidate();
        qc.invalidateQueries({ queryKey: ['pins'] });
      },
    }),
  };
}
