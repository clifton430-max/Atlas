/**
 * Collectibles client. Odds come from the server's ACTIVE config (so what we
 * publish is exactly what the server uses); rolls are decided by open_crate();
 * the inventory and history are read through RLS. Account-only: guests can
 * browse the catalog and odds but not roll.
 */
import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requireSupabase, supabase, unwrap } from '@/lib/supabase';
import { useAuth } from '@/app/AuthProvider';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import type { CrateKind, Rarity } from './catalog';

type Row = Record<string, unknown>;

export function useCollectiblesAccount() {
  const { user } = useAuth();
  const ws = useWorkspace();
  return { signedIn: !!user && !ws.local, userId: user?.id ?? null, configured: !!supabase };
}

export interface CrateStatus { version: number; weights: Record<Rarity, number>; dailyFreeRolls: number; rollsLeft: number | null }
export function useCrateStatus(crate: CrateKind) {
  const { signedIn, userId } = useCollectiblesAccount();
  return useQuery({
    queryKey: ['crate-status', crate, userId],
    enabled: !!supabase,
    queryFn: async (): Promise<CrateStatus | null> => {
      const sb = requireSupabase();
      if (signedIn) {
        const rows = unwrap(await sb.rpc('crate_status', { p_crate: crate })) as Row[];
        const r = rows?.[0];
        return r ? { version: Number(r.config_version), weights: r.weights as Record<Rarity, number>, dailyFreeRolls: Number(r.daily_free_rolls), rollsLeft: r.rolls_left == null ? null : Number(r.rolls_left) } : null;
      }
      // Signed out: the published (active) odds are public table data.
      const r = unwrap(await sb.from('crate_configs').select('version, weights, daily_free_rolls').eq('crate', crate).eq('active', true).maybeSingle()) as Row | null;
      return r ? { version: Number(r.version), weights: r.weights as Record<Rarity, number>, dailyFreeRolls: Number(r.daily_free_rolls), rollsLeft: null } : null;
    },
  });
}

export interface InventoryItem { defId: string; copies: number; firstAt: string }
export function useInventory() {
  const { signedIn, userId } = useCollectiblesAccount();
  return useQuery({
    queryKey: ['inventory', userId],
    enabled: signedIn,
    queryFn: async () => (unwrap(await requireSupabase().from('user_collectibles').select('def_id, copies, first_at')) as Row[])
      .map((r): InventoryItem => ({ defId: String(r.def_id), copies: Number(r.copies), firstAt: String(r.first_at) })),
  });
}

export interface RollRecord { id: string; crate: CrateKind; defId: string; rarity: Rarity; duplicate: boolean; createdAt: string }
export function useRollHistory(crate: CrateKind) {
  const { signedIn, userId } = useCollectiblesAccount();
  return useQuery({
    queryKey: ['rolls', crate, userId],
    enabled: signedIn,
    queryFn: async () => (unwrap(await requireSupabase().from('crate_rolls').select('id, crate, def_id, rarity, duplicate, created_at')
      .eq('crate', crate).order('created_at', { ascending: false }).limit(10)) as Row[])
      .map((r): RollRecord => ({ id: String(r.id), crate: r.crate as CrateKind, defId: String(r.def_id), rarity: r.rarity as Rarity, duplicate: Boolean(r.duplicate), createdAt: String(r.created_at) })),
  });
}

export interface RollResult { rollId: string; defId: string; rarity: Rarity; duplicate: boolean; copies: number; rollsLeft: number; replayed: boolean }

/**
 * Open a crate. One idempotency key per user action: if the request fails or
 * the response is lost, retrying the SAME action reuses the key, so the server
 * returns the original result instead of spending another roll.
 */
export function useOpenCrate(crate: CrateKind) {
  const qc = useQueryClient();
  const pendingKey = useRef<string | null>(null);
  const m = useMutation({
    mutationFn: async (): Promise<RollResult> => {
      pendingKey.current ??= crypto.randomUUID();
      const rows = unwrap(await requireSupabase().rpc('open_crate', { p_crate: crate, p_idempotency_key: pendingKey.current })) as Row[];
      const r = rows[0];
      return { rollId: String(r.roll_id), defId: String(r.def_id), rarity: r.rarity as Rarity, duplicate: Boolean(r.duplicate), copies: Number(r.copies), rollsLeft: Number(r.rolls_left), replayed: Boolean(r.replayed) };
    },
    onSuccess: () => { pendingKey.current = null; }, // persisted -> next click is a new roll
    onError: (e) => { if (/No free rolls|blocked/.test(String((e as Error).message))) pendingKey.current = null; },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['crate-status', crate] });
      void qc.invalidateQueries({ queryKey: ['inventory'] });
      void qc.invalidateQueries({ queryKey: ['rolls', crate] });
    },
  });
  return m;
}

// ---- Placements ------------------------------------------------------------------
export interface Placement { id: string; mapId: string; defId: string; latitude: number; longitude: number; rotationDeg: number; scale: number; tint: string | null }
const toPlacement = (r: Row): Placement => ({
  id: String(r.id), mapId: String(r.map_id), defId: String(r.def_id), latitude: Number(r.latitude), longitude: Number(r.longitude),
  rotationDeg: Number(r.rotation_deg), scale: Number(r.scale), tint: (r.tint as string) ?? null,
});
export const placementsKey = (mapId: string) => ['placements', mapId] as const;

export function usePlacements(mapId: string | undefined) {
  const { signedIn } = useCollectiblesAccount();
  return useQuery({
    queryKey: placementsKey(mapId ?? ''),
    enabled: signedIn && !!mapId,
    queryFn: async () => (unwrap(await requireSupabase().from('monument_placements').select('*').eq('map_id', mapId!).order('created_at')) as Row[]).map(toPlacement),
  });
}

export function usePlacementMutations(mapId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: placementsKey(mapId) });
  return {
    create: useMutation({
      mutationFn: async (p: Omit<Placement, 'id' | 'mapId' | 'tint'>) => toPlacement(unwrap(await requireSupabase().from('monument_placements')
        .insert({ map_id: mapId, def_id: p.defId, latitude: p.latitude, longitude: p.longitude, rotation_deg: p.rotationDeg, scale: p.scale }).select('*').single()) as Row),
      onSettled: refresh,
    }),
    update: useMutation({
      mutationFn: async (p: Pick<Placement, 'id'> & Partial<Pick<Placement, 'latitude' | 'longitude' | 'rotationDeg' | 'scale'>>) => {
        const patch: { latitude?: number; longitude?: number; rotation_deg?: number; scale?: number } = {};
        if (p.latitude != null) patch.latitude = p.latitude;
        if (p.longitude != null) patch.longitude = p.longitude;
        if (p.rotationDeg != null) patch.rotation_deg = p.rotationDeg;
        if (p.scale != null) patch.scale = p.scale;
        unwrap(await requireSupabase().from('monument_placements').update(patch).eq('id', p.id).select('id').single());
      },
      onSettled: refresh,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => { unwrap(await requireSupabase().from('monument_placements').delete().eq('id', id).select('id').single()); },
      onSettled: refresh,
    }),
  };
}

// ---- Equipped map skin (personal maps only) ------------------------------------------
export function useMapSkin(mapId: string | undefined) {
  const { signedIn } = useCollectiblesAccount();
  return useQuery({
    queryKey: ['map-skin', mapId],
    enabled: signedIn && !!mapId,
    queryFn: async () => {
      const r = unwrap(await requireSupabase().from('map_skins').select('def_id').eq('map_id', mapId!).maybeSingle()) as Row | null;
      return r ? String(r.def_id) : null;
    },
  });
}

export function useEquipSkin(mapId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (defId: string | null) => {
      const sb = requireSupabase();
      if (!defId) unwrap(await sb.from('map_skins').delete().eq('map_id', mapId).select('map_id'));
      else unwrap(await sb.from('map_skins').upsert({ map_id: mapId, def_id: defId }).select('map_id').single());
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['map-skin', mapId] }),
  });
}
