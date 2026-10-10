/** Personal maps: owner-only rows (RLS maps_owner_all). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requireSupabase, unwrap } from '@/lib/supabase';
import { qk } from '@/lib/queryClient';
import type { PersonalMap } from '@/lib/types';
import { useAuth } from '@/app/AuthProvider';

const fromRow = (r: Record<string, unknown>): PersonalMap => ({
  id: String(r.id),
  name: String(r.name),
  description: (r.description as string | null) ?? null,
  createdAt: String(r.created_at),
});

export function useMaps() {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.maps,
    enabled: !!user,
    queryFn: async () => {
      const rows = unwrap(await requireSupabase().from('maps').select('id, name, description, created_at').order('created_at'));
      return (rows as Record<string, unknown>[]).map(fromRow);
    },
  });
}

export function useMapMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.maps });
  return {
    create: useMutation({
      mutationFn: async (input: { name: string; description?: string }) =>
        fromRow(unwrap(await requireSupabase().from('maps')
          .insert({ name: input.name.trim(), description: input.description?.trim() || null })
          .select('id, name, description, created_at').single()) as Record<string, unknown>),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: async (input: { id: string; name: string; description?: string | null }) => {
        unwrap(await requireSupabase().from('maps')
          .update({ name: input.name.trim(), description: input.description?.trim() || null })
          .eq('id', input.id).select('id').single());
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      // Cascades to the map's pins and their memberships (FK ON DELETE CASCADE).
      // Shared representations elsewhere survive (source_pin_id -> NULL).
      mutationFn: async (id: string) => {
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
