/**
 * Private pins (saved-event pins and custom pins).
 *
 * - Reads are owner-only via RLS; a saved-event pin embeds the referenced
 *   public event (never a copy) and its group memberships.
 * - Saving and creating go through RPCs (save_event_pin / create_custom_pin)
 *   so pin + memberships are written atomically and a group is mandatory.
 * - Appearance edits touch only appearance columns, preserving identity,
 *   coordinates, owner, event association, memberships and permissions.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requireSupabase, unwrap } from '@/lib/supabase';
import { qk } from '@/lib/queryClient';
import type { Pin, PinAppearance, PinImage } from '@/lib/types';
import { EVENT_COLUMNS, eventFromRow, type EventRow } from '@/services/events/mapRow';
import { useAuth } from '@/app/AuthProvider';
import { tryDeleteImage } from './images';

type Row = Record<string, unknown>;

export const IMAGE_COLUMNS = 'id, storage_path, mime_type, byte_size, width, height';
const PIN_SELECT = `id, map_id, kind, event_id, title, note, latitude, longitude, address, created_at,
  color, shape, icon, size, border_color, border_width, image_id, image_mask,
  event:events(${EVENT_COLUMNS}),
  image:pin_images(${IMAGE_COLUMNS}),
  pin_groups(group_id)`;

export const imageFromRow = (r: Row | null | undefined): PinImage | null =>
  r ? {
    id: String(r.id), storagePath: String(r.storage_path), mimeType: String(r.mime_type),
    byteSize: Number(r.byte_size), width: (r.width as number) ?? null, height: (r.height as number) ?? null,
  } : null;

export const appearanceFromRow = (r: Row): PinAppearance => ({
  color: (r.color as string | null) ?? null,
  shape: (r.shape as PinAppearance['shape']) ?? 'circle',
  icon: (r.icon as string | null) ?? null,
  size: Number(r.size ?? 32),
  borderColor: (r.border_color as string | null) ?? null,
  borderWidth: Number(r.border_width ?? 2),
  imageId: (r.image_id as string | null) ?? null,
  imageMask: (r.image_mask as PinAppearance['imageMask']) ?? 'circle',
});

export function pinFromRow(r: Row): Pin {
  const event = r.event ? eventFromRow(r.event as EventRow) : null;
  return {
    id: String(r.id),
    mapId: String(r.map_id),
    kind: r.kind as Pin['kind'],
    eventId: (r.event_id as string | null) ?? null,
    event,
    title: (r.title as string | null) ?? null,
    note: (r.note as string | null) ?? null,
    latitude: r.kind === 'event' ? event?.latitude ?? null : (r.latitude as number),
    longitude: r.kind === 'event' ? event?.longitude ?? null : (r.longitude as number),
    address: (r.address as string | null) ?? null,
    appearance: appearanceFromRow(r),
    image: imageFromRow(r.image as Row | null),
    groupIds: ((r.pin_groups as Row[] | null) ?? []).map((g) => String(g.group_id)),
    createdAt: String(r.created_at),
  };
}

export const pinTitle = (p: Pin) => p.title ?? p.event?.name ?? 'Untitled pin';

export function usePins(mapId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.pins(mapId ?? ''),
    enabled: !!user && !!mapId,
    queryFn: async () => {
      const rows = unwrap(await requireSupabase().from('pins').select(PIN_SELECT).eq('map_id', mapId!).order('created_at'));
      return (rows as Row[]).map(pinFromRow);
    },
  });
}

export function useAllPins() {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.allPins,
    enabled: !!user,
    queryFn: async () => {
      const rows = unwrap(await requireSupabase().from('pins').select(PIN_SELECT).order('created_at', { ascending: false }));
      return (rows as Row[]).map(pinFromRow);
    },
  });
}

/** eventId -> saved pins, used to show "Saved" state on Discover events. */
export function useSavedEvents() {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.savedEvents,
    enabled: !!user,
    queryFn: async () => {
      const rows = unwrap(await requireSupabase().from('pins')
        .select('id, map_id, event_id, pin_groups(group_id)').eq('kind', 'event'));
      const byEvent = new Map<string, { pinId: string; mapId: string; groupIds: string[] }[]>();
      for (const r of rows as Row[]) {
        const list = byEvent.get(String(r.event_id)) ?? [];
        list.push({
          pinId: String(r.id), mapId: String(r.map_id),
          groupIds: ((r.pin_groups as Row[]) ?? []).map((g) => String(g.group_id)),
        });
        byEvent.set(String(r.event_id), list);
      }
      return byEvent;
    },
  });
}

export function usePinMutations() {
  const qc = useQueryClient();
  const invalidatePins = () => {
    qc.invalidateQueries({ queryKey: ['pins'] });
    qc.invalidateQueries({ queryKey: qk.savedEvents });
  };

  return {
    saveEvent: useMutation({
      mutationFn: async (input: { mapId: string; eventId: string; groupIds: string[] }) => {
        if (!input.groupIds.length) throw new Error('Choose at least one group.');
        return unwrap(await requireSupabase().rpc('save_event_pin', {
          p_map_id: input.mapId, p_event_id: input.eventId, p_group_ids: input.groupIds,
        })) as string;
      },
      onSuccess: invalidatePins,
    }),
    createCustom: useMutation({
      mutationFn: async (input: {
        mapId: string; title: string; note: string; latitude: number; longitude: number;
        address: string | null; groupIds: string[];
      }) => {
        if (!input.groupIds.length) throw new Error('Choose at least one group.');
        return unwrap(await requireSupabase().rpc('create_custom_pin', {
          p_map_id: input.mapId, p_title: input.title, p_note: input.note,
          p_latitude: input.latitude, p_longitude: input.longitude,
          p_address: input.address ?? '', p_group_ids: input.groupIds,
        })) as string;
      },
      onSuccess: invalidatePins,
    }),
    setGroups: useMutation({
      mutationFn: async (input: { pinId: string; groupIds: string[] }) => {
        unwrap(await requireSupabase().rpc('set_pin_groups', { p_pin_id: input.pinId, p_group_ids: input.groupIds }));
      },
      onSuccess: invalidatePins,
    }),
    updateDetails: useMutation({
      mutationFn: async (input: { pinId: string; title?: string | null; note?: string | null; address?: string | null }) => {
        const patch: Row = {};
        if (input.title !== undefined) patch.title = input.title?.trim() || null;
        if (input.note !== undefined) patch.note = input.note?.trim() || null;
        if (input.address !== undefined) patch.address = input.address?.trim() || null;
        unwrap(await requireSupabase().from('pins').update(patch).eq('id', input.pinId).select('id').single());
      },
      onSuccess: invalidatePins,
    }),
    updateAppearance: useMutation({
      /**
       * Writes appearance columns only. If the image changed, the previous
       * image is cleaned up only when nothing else references it.
       */
      mutationFn: async (input: { pin: Pin; appearance: PinAppearance }) => {
        const a = input.appearance;
        unwrap(await requireSupabase().from('pins').update({
          color: a.color, shape: a.shape, icon: a.icon, size: a.size,
          border_color: a.borderColor, border_width: a.borderWidth,
          image_id: a.imageId, image_mask: a.imageMask,
        }).eq('id', input.pin.id).select('id').single());
        const old = input.pin.image;
        if (old && old.id !== a.imageId) await tryDeleteImage(old);
      },
      onSuccess: invalidatePins,
    }),
    remove: useMutation({
      mutationFn: async (pin: Pin) => {
        unwrap(await requireSupabase().from('pins').delete().eq('id', pin.id).select('id').single());
        if (pin.image) await tryDeleteImage(pin.image);
      },
      onSuccess: invalidatePins,
    }),
  };
}

/** Fetch a single public event by id (for pins/search results outside the viewport). */
export async function fetchEvent(id: string) {
  const row = unwrap(await requireSupabase().from('events').select(EVENT_COLUMNS).eq('id', id).maybeSingle());
  return row ? eventFromRow(row as EventRow) : null;
}
