/**
 * Collaboration maps, members, invitations and shared pin representations.
 *
 * Authorization lives in the database:
 *   - membership-scoped reads via RLS (is_collab_member);
 *   - owner-only actions (invite, role change, rename, delete, remove member)
 *     re-check the caller's stored role in RLS/RPCs — UI hiding is cosmetic;
 *   - sharing goes through share_pin(), which verifies pin ownership and
 *     editor/owner role, then snapshots the pin into shared_pins.
 */
import { sanitizePinSource, type PinSource } from '@/features/pins/pinSource';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requireSupabase, unwrap } from '@/lib/supabase';
import { qk } from '@/lib/queryClient';
import type { CollabInvitation, CollabMap, CollabMember, CollabRole, SharedPin } from '@/lib/types';
import { useAuth } from '@/app/AuthProvider';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';

/** Id used for the local demo collaboration map (guest/sandbox only). */
export const DEMO_COLLAB_ID = 'demo';
import { appearanceFromRow, IMAGE_COLUMNS, imageFromRow } from '@/features/pins/api';

type Row = Record<string, unknown>;

export function useCollabMaps() {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.collabMaps,
    enabled: !!user,
    queryFn: async () => {
      const rows = unwrap(await requireSupabase().from('collab_maps')
        .select('id, name, description, owner_id, collab_members(user_id, role)').order('created_at'));
      return (rows as Row[]).map((r): CollabMap => {
        const me = ((r.collab_members as Row[]) ?? []).find((m) => m.user_id === user!.id);
        return {
          id: String(r.id), name: String(r.name), description: (r.description as string) ?? null,
          ownerId: String(r.owner_id), myRole: (me?.role as CollabRole) ?? 'viewer',
        };
      });
    },
  });
}

export function useCollabMembers(mapId: string | undefined) {
  return useQuery({
    queryKey: qk.collabMembers(mapId ?? ''),
    enabled: !!mapId,
    queryFn: async () => {
      const rows = unwrap(await requireSupabase().from('collab_members')
        .select('user_id, role, profile:profiles!collab_members_user_id_fkey(username, display_name)')
        .eq('map_id', mapId!));
      const order: Record<CollabRole, number> = { owner: 0, editor: 1, viewer: 2 };
      return (rows as Row[]).map((r): CollabMember => {
        const p = (r.profile as Row | null) ?? {};
        return {
          userId: String(r.user_id), role: r.role as CollabRole,
          username: String(p.username ?? 'unknown'), displayName: String(p.display_name ?? ''),
        };
      }).sort((a, b) => order[a.role] - order[b.role] || a.username.localeCompare(b.username));
    },
  });
}

export const sharedPinFromRow = (r: Row): SharedPin => {
  const sharer = r.sharer as Row | null;
  return {
    id: String(r.id), collabMapId: String(r.collab_map_id), sharedBy: String(r.shared_by),
    sharedByName: sharer ? String(sharer.display_name || sharer.username) : null,
    sourcePinId: (r.source_pin_id as string) ?? null, eventId: (r.event_id as string) ?? null,
    title: String(r.title), note: (r.note as string) ?? null,
    latitude: Number(r.latitude), longitude: Number(r.longitude), address: (r.address as string) ?? null,
    appearance: appearanceFromRow(r), image: imageFromRow(r.image as Row | null),
    attendance: (r.attendance as SharedPin['attendance']) ?? null,
    placeRef: (r.place_ref as string | null) ?? null,
    source: sanitizePinSource(r.source),
    createdAt: String(r.created_at),
  };
};

export function useSharedPins(mapId: string | undefined) {
  return useQuery({
    queryKey: qk.sharedPins(mapId ?? ''),
    enabled: !!mapId,
    queryFn: async () => {
      const rows = unwrap(await requireSupabase().from('shared_pins')
        .select(`id, collab_map_id, shared_by, source_pin_id, event_id, title, note, latitude, longitude, address,
          color, shape, icon, size, border_color, border_width, image_id, image_mask, created_at, attendance, place_ref, source,
          image:pin_images(${IMAGE_COLUMNS}),
          sharer:profiles!shared_pins_shared_by_fkey(username, display_name)`)
        .eq('collab_map_id', mapId!).order('created_at'));
      return (rows as Row[]).map(sharedPinFromRow);
    },
  });
}

/** Where a private pin of mine is currently shared. */
export function usePinShares(pinId: string | undefined) {
  const { user } = useAuth();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [...qk.pinShares(pinId ?? ''), ws.scope],
    enabled: !!pinId && (!!user || !!ws.local),
    queryFn: async () => {
      if (ws.local) {
        const demo = ws.local.snapshot().demo;
        return demo.shares.filter((s) => s.sourcePinId === pinId).map((s) => ({
          id: s.id, collabMapId: DEMO_COLLAB_ID, mapName: `${demo.mapName} — demo`,
          includesNote: s.note != null, includesImage: s.imageId != null,
        }));
      }
      const rows = unwrap(await requireSupabase().from('shared_pins')
        .select('id, collab_map_id, note, image_id, collab:collab_maps(name)')
        .eq('source_pin_id', pinId!).eq('shared_by', user!.id));
      return (rows as Row[]).map((r) => ({
        id: String(r.id), collabMapId: String(r.collab_map_id),
        mapName: String((r.collab as Row | null)?.name ?? 'Collaboration map'),
        includesNote: r.note != null, includesImage: r.image_id != null,
      }));
    },
  });
}

export function useInvitations(mapId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: qk.invitations(mapId ?? ''),
    enabled: !!mapId && enabled,
    queryFn: async () => {
      const rows = unwrap(await requireSupabase().from('collab_invitations')
        .select('id, map_id, role, recipient_id, expires_at, max_uses, use_count, revoked_at, declined_at, created_at')
        .eq('map_id', mapId!).order('created_at', { ascending: false }));
      return (rows as Row[]).map((r): CollabInvitation => ({
        id: String(r.id), mapId: String(r.map_id), role: r.role as CollabRole,
        recipientId: (r.recipient_id as string) ?? null, expiresAt: String(r.expires_at),
        maxUses: (r.max_uses as number) ?? null, useCount: Number(r.use_count),
        revokedAt: (r.revoked_at as string) ?? null, declinedAt: (r.declined_at as string) ?? null,
        createdAt: String(r.created_at),
      }));
    },
  });
}

export function invitationState(i: CollabInvitation): 'active' | 'revoked' | 'expired' | 'used' | 'declined' {
  if (i.revokedAt) return 'revoked';
  if (i.declinedAt) return 'declined';
  if (new Date(i.expiresAt).getTime() <= Date.now()) return 'expired';
  if (i.maxUses != null && i.useCount >= i.maxUses) return 'used';
  return 'active';
}

export interface PendingInvite {
  invitationId: string; mapId: string; mapName: string; role: CollabRole; inviterName: string; expiresAt: string;
}

export function useMyPendingInvitations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.myInvites,
    enabled: !!user,
    queryFn: async () => {
      const rows = unwrap(await requireSupabase().rpc('my_pending_invitations'));
      return ((rows ?? []) as Row[]).map((r): PendingInvite => ({
        invitationId: String(r.invitation_id), mapId: String(r.map_id), mapName: String(r.map_name),
        role: r.role as CollabRole, inviterName: String(r.inviter_name), expiresAt: String(r.expires_at),
      }));
    },
  });
}

export interface InvitePreview {
  status: 'valid' | 'already_member' | 'invalid' | 'revoked' | 'declined' | 'expired' | 'used' | 'wrong_recipient';
  mapId: string | null; mapName: string | null; role: CollabRole | null; inviterName: string | null; expiresAt: string | null;
}

export async function previewInvitation(token: string): Promise<InvitePreview> {
  const rows = unwrap(await requireSupabase().rpc('preview_collab_invitation', { p_token: token })) as Row[];
  const r = rows?.[0] ?? { status: 'invalid' };
  return {
    status: r.status as InvitePreview['status'], mapId: (r.map_id as string) ?? null,
    mapName: (r.map_name as string) ?? null, role: (r.role as CollabRole) ?? null,
    inviterName: (r.inviter_name as string) ?? null, expiresAt: (r.expires_at as string) ?? null,
  };
}

export function inviteUrl(token: string): string {
  return `${window.location.origin}/invite/${encodeURIComponent(token)}`;
}

export function useCollabMutations() {
  const qc = useQueryClient();
  const ws = useWorkspace();
  const sb = () => requireSupabase();
  const invalidateMaps = () => qc.invalidateQueries({ queryKey: qk.collabMaps });

  return {
    /** A custom pin at any point (editors/owners; retried requests return the same pin). */
    addCustomPin: useMutation({
      mutationFn: async (i: { collabMapId: string; title: string; note?: string | null; latitude: number; longitude: number }) =>
        unwrap(await sb().rpc('create_shared_custom_pin', {
          p_collab_map_id: i.collabMapId, p_title: i.title, p_latitude: i.latitude, p_longitude: i.longitude, p_note: i.note ?? undefined,
        })) as string,
      onSettled: (_d, _e, i) => qc.invalidateQueries({ queryKey: qk.sharedPins(i.collabMapId) }),
    }),
    /** Partial edit by the pin's author or the map owner (enforced by the server). */
    updateSharedPin: useMutation({
      mutationFn: async (i: { id: string; collabMapId: string; title?: string; note?: string | null; latitude?: number; longitude?: number }) => {
        unwrap(await sb().rpc('update_shared_pin_details', {
          p_shared_pin_id: i.id, p_title: i.title, p_note: i.note ?? undefined, p_clear_note: i.note === null,
          p_latitude: i.latitude, p_longitude: i.longitude,
        }));
      },
      onSettled: (_d, _e, i) => qc.invalidateQueries({ queryKey: qk.sharedPins(i.collabMapId) }),
    }),
    create: useMutation({
      mutationFn: async (input: { name: string; description?: string }) =>
        unwrap(await sb().rpc('create_collab_map', { p_name: input.name, p_description: input.description || undefined })) as string,
      onSuccess: invalidateMaps,
    }),
    rename: useMutation({
      mutationFn: async (input: { id: string; name: string; description?: string | null }) => {
        unwrap(await sb().from('collab_maps').update({ name: input.name.trim(), description: input.description?.trim() || null })
          .eq('id', input.id).select('id').single());
      },
      onSuccess: invalidateMaps,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        unwrap(await sb().from('collab_maps').delete().eq('id', id).select('id').single());
      },
      onSuccess: () => {
        invalidateMaps();
        qc.invalidateQueries({ queryKey: ['pinShares'] });
      },
    }),
    leave: useMutation({
      mutationFn: async (input: { mapId: string; userId: string }) => {
        unwrap(await sb().from('collab_members').delete().eq('map_id', input.mapId).eq('user_id', input.userId).select('user_id').single());
      },
      onSuccess: invalidateMaps,
    }),
    removeMember: useMutation({
      mutationFn: async (input: { mapId: string; userId: string }) => {
        unwrap(await sb().from('collab_members').delete().eq('map_id', input.mapId).eq('user_id', input.userId).select('user_id').single());
      },
      onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: qk.collabMembers(v.mapId) }),
    }),
    setRole: useMutation({
      mutationFn: async (input: { mapId: string; userId: string; role: Exclude<CollabRole, 'owner'> }) => {
        unwrap(await sb().rpc('set_collab_member_role', { p_map_id: input.mapId, p_user_id: input.userId, p_role: input.role }));
      },
      onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: qk.collabMembers(v.mapId) }),
    }),
    createInvitation: useMutation({
      mutationFn: async (input: {
        mapId: string; role: 'editor' | 'viewer'; recipientId: string | null; expiresInHours: number; maxUses: number | null;
      }) => {
        const rows = unwrap(await sb().rpc('create_collab_invitation', {
          p_map_id: input.mapId, p_role: input.role, p_recipient_id: input.recipientId ?? undefined,
          p_expires_in_hours: input.expiresInHours, p_max_uses: input.maxUses ?? undefined,
        })) as Row[];
        const r = rows[0];
        return { invitationId: String(r.invitation_id), token: String(r.token), expiresAt: String(r.expires_at) };
      },
      onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: qk.invitations(v.mapId) }),
    }),
    revokeInvitation: useMutation({
      mutationFn: async (input: { id: string; mapId: string }) => {
        unwrap(await sb().rpc('revoke_collab_invitation', { p_invitation_id: input.id }));
      },
      onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: qk.invitations(v.mapId) }),
    }),
    acceptToken: useMutation({
      mutationFn: async (token: string) => unwrap(await sb().rpc('accept_collab_invitation', { p_token: token })) as string,
      onSuccess: invalidateMaps,
    }),
    respondInvite: useMutation({
      mutationFn: async (input: { invitationId: string; accept: boolean }) =>
        unwrap(await sb().rpc('respond_collab_invitation', { p_invitation_id: input.invitationId, p_accept: input.accept })) as string | null,
      onSuccess: () => {
        invalidateMaps();
        qc.invalidateQueries({ queryKey: qk.myInvites });
      },
    }),
    sharePin: useMutation({
      mutationFn: async (input: { pinId: string; collabMapId: string; includeNote: boolean; includeAppearance: boolean }) =>
        unwrap(await sb().rpc('share_pin', {
          p_pin_id: input.pinId, p_collab_map_id: input.collabMapId,
          p_include_note: input.includeNote, p_include_appearance: input.includeAppearance,
        })) as string,
      onSuccess: (_d, v) => {
        qc.invalidateQueries({ queryKey: qk.sharedPins(v.collabMapId) });
        qc.invalidateQueries({ queryKey: qk.pinShares(v.pinId) });
      },
    }),
    /**
     * Pin a public event or an OpenStreetMap place straight into a collaboration
     * map (owner/editor only — enforced by add_to_collab on the server).
     */
    addToCollab: useMutation({
      mutationFn: async (input: {
        collabMapId: string;
        eventId?: string;
        place?: { ref: string; name: string; latitude: number; longitude: number; address: string | null };
        attendance?: 'going' | 'interested' | null;
        source?: PinSource | null;
      }) => unwrap(await sb().rpc('add_to_collab', {
        p_collab_map_id: input.collabMapId,
        p_event_id: input.eventId,
        p_place_ref: input.place?.ref,
        p_title: input.place?.name,
        p_latitude: input.place?.latitude,
        p_longitude: input.place?.longitude,
        p_address: input.place?.address ?? undefined,
        p_attendance: input.attendance ?? undefined,
        p_source: (input.source ?? undefined) as never,
      })) as string,
      onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: qk.sharedPins(v.collabMapId) }),
    }),
    removeSharedPin: useMutation({
      /** Removes ONLY the representation; the private original and its image remain. */
      mutationFn: async (input: { id: string; collabMapId: string }) => {
        if (ws.local && input.collabMapId === DEMO_COLLAB_ID) return ws.local.removeDemoShare(input.id);
        unwrap(await sb().from('shared_pins').delete().eq('id', input.id).select('id').single());
      },
      onSuccess: (_d, v) => {
        qc.invalidateQueries({ queryKey: qk.sharedPins(v.collabMapId) });
        qc.invalidateQueries({ queryKey: ['pinShares'] });
      },
    }),
  };
}
