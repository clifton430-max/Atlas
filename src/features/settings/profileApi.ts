import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requireSupabase, unwrap } from '@/lib/supabase';
import { qk } from '@/lib/queryClient';
import type { Profile } from '@/lib/types';
import { useAuth } from '@/app/AuthProvider';
import type { Database } from '@/lib/database.types';

// friend_code is deliberately not selectable (column privilege); see get_my_friend_code().
const PROFILE_COLUMNS = 'id, username, display_name, discoverable, map_style';

export const profileFromRow = (r: Record<string, unknown>): Profile => ({
  id: String(r.id),
  username: String(r.username),
  displayName: String(r.display_name ?? ''),
  discoverable: r.discoverable !== false,
  mapStyle: (r.map_style as Profile['mapStyle']) ?? 'positron',
});

export function useProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.profile(user?.id),
    enabled: !!user,
    queryFn: async () => {
      const row = unwrap(await requireSupabase().from('profiles').select(PROFILE_COLUMNS).eq('id', user!.id).single());
      return profileFromRow(row as Record<string, unknown>);
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (patch: Partial<Pick<Profile, 'username' | 'displayName' | 'discoverable' | 'mapStyle'>>) => {
      const row: Database['public']['Tables']['profiles']['Update'] = {};
      if (patch.username !== undefined) row.username = patch.username;
      if (patch.displayName !== undefined) row.display_name = patch.displayName;
      if (patch.discoverable !== undefined) row.discoverable = patch.discoverable;
      if (patch.mapStyle !== undefined) row.map_style = patch.mapStyle;
      unwrap(await requireSupabase().from('profiles').update(row).eq('id', user!.id).select('id').single());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.profile(user?.id) }),
  });
}
