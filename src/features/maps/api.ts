/**
 * Personal maps.
 *   account mode: owner-only rows in public.maps (RLS maps_owner_all).
 *   guest/sandbox: the browser-local workspace (never sent to Supabase).
 * The workspace scope is part of every query key so data never mixes.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requireSupabase, unwrap } from '@/lib/supabase';
import { qk } from '@/lib/queryClient';
import type { PersonalMap } from '@/lib/types';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';

const fromRow = (r: Record<string, unknown>): PersonalMap => ({
  id: String(r.id),
  name: String(r.name),
  description: (r.description as string | null) ?? null,
  createdAt: String(r.created_at),
});

export function useMaps() {
  const ws = useWorkspace();
  return useQuery({
    queryKey: [...qk.maps, ws.scope],
    enabled: ws.scope !== 'pending',
    queryFn: async () => {
      if (ws.local) return ws.local.listMaps();
      const rows = unwrap(await requireSupabase().from('maps').select('id, name, description, created_at').order('created_at'));
      return (rows as Record<string, unknown>[]).map(fromRow);
    },
  });
}

export function useMapMutations() {
  const qc = useQueryClient();
  const ws = useWorkspace();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.maps });
  return {
    create: useMutation({
      mutationFn: async (input: { name: string; description?: string }): Promise<PersonalMap> => {
        if (ws.local) return ws.local.createMap(input);
        return fromRow(unwrap(await requireSupabase().from('maps')
          .insert({ name: input.name.trim(), description: input.description?.trim() || null })
          .select('id, name, description, created_at').single()) as Record<string, unknown>);
      },
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: async (input: { id: string; name: string; description?: string | null }) => {
        if (ws.local) return ws.local.updateMap(input.id, input);
        unwrap(await requireSupabase().from('maps')
          .update({ name: input.name.trim(), description: input.description?.trim() || null })
          .eq('id', input.id).select('id').single());
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      // Account: cascades to the map's pins and memberships (FK ON DELETE CASCADE);
      // shared representations elsewhere survive. Local: same semantics.
      mutationFn: async (id: string) => {
        if (ws.local) return ws.local.deleteMap(id);
        unwrap(await requireSupabase().from('maps').delete().eq('id', id).select('id').single());
      },
      onSuccess: () => {
        invalidate();
        qc.invalidateQueries({ queryKey: ['pins'] });
        qc.invalidateQueries({ queryKey: qk.savedEvents });
      },
    }),
  };
}
