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
import type { AtlasEvent, Attendance, Pin, PinAppearance, PinImage } from '@/lib/types';
import type { Place } from '@/features/places/types';
import { EVENT_COLUMNS, eventFromRow, type EventRow } from '@/services/events/mapRow';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import type { Database } from '@/lib/database.types';
import { tryDeleteImage } from './images';
import { sanitizePinSource, type PinSource } from './pinSource';

type Row = Record<string, unknown>;

export const IMAGE_COLUMNS = 'id, storage_path, mime_type, byte_size, width, height';
const PIN_SELECT = `id, map_id, kind, event_id, title, note, latitude, longitude, address, created_at, attendance, place_ref, source,
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
    attendance: (r.attendance as Pin['attendance']) ?? null,
    placeRef: (r.place_ref as string | null) ?? null,
    source: sanitizePinSource(r.source),
    createdAt: String(r.created_at),
  };
}

export const pinTitle = (p: Pin) => p.title ?? p.event?.name ?? 'Untitled pin';

export function usePins(mapId: string | undefined) {
  const ws = useWorkspace();
  return useQuery({
    queryKey: [...qk.pins(mapId ?? ''), ws.scope],
    enabled: !!mapId && ws.scope !== 'pending',
    queryFn: async () => {
      if (ws.local) return ws.local.listPins(mapId);
      const rows = unwrap(await requireSupabase().from('pins').select(PIN_SELECT).eq('map_id', mapId!).order('created_at'));
      return (rows as Row[]).map(pinFromRow);
    },
  });
}

export function useAllPins() {
  const ws = useWorkspace();
  return useQuery({
    queryKey: [...qk.allPins, ws.scope],
    enabled: ws.scope !== 'pending',
    queryFn: async () => {
      if (ws.local) return ws.local.listPins().reverse();
      const rows = unwrap(await requireSupabase().from('pins').select(PIN_SELECT).order('created_at', { ascending: false }));
      return (rows as Row[]).map(pinFromRow);
    },
  });
}

/** eventId -> saved pins, used to show "Saved" state on Discover events. */
export function useSavedEvents() {
  const ws = useWorkspace();
  return useQuery({
    queryKey: [...qk.savedEvents, ws.scope],
    enabled: ws.scope !== 'pending',
    queryFn: async () => {
      if (ws.local) {
        const byEvent = new Map<string, { pinId: string; mapId: string; groupIds: string[]; attendance?: Attendance | null }[]>();
        for (const p of ws.local.listPins()) {
          const key = p.kind === 'event' ? p.eventId : p.placeRef;
          if (!key) continue;
          byEvent.set(key, [...(byEvent.get(key) ?? []), { pinId: p.id, mapId: p.mapId, groupIds: p.groupIds, attendance: p.attendance }]);
        }
        return byEvent;
      }
      const rows = unwrap(await requireSupabase().from('pins')
        .select('id, map_id, event_id, place_ref, attendance, pin_groups(group_id)').or('kind.eq.event,place_ref.not.is.null'));
      // Keyed by event id or place ref: lets Discover show "saved" state for both.
      const byEvent = new Map<string, { pinId: string; mapId: string; groupIds: string[]; attendance?: Attendance | null }[]>();
      for (const r of rows as Row[]) {
        const key = String(r.event_id ?? r.place_ref);
        const list = byEvent.get(key) ?? [];
        list.push({
          pinId: String(r.id), mapId: String(r.map_id),
          groupIds: ((r.pin_groups as Row[]) ?? []).map((g) => String(g.group_id)),
          attendance: (r.attendance as Attendance | null) ?? null,
        });
        byEvent.set(key, list);
      }
      return byEvent;
    },
  });
}

export function usePinMutations() {
  const qc = useQueryClient();
  const ws = useWorkspace();
  const invalidatePins = () => {
    qc.invalidateQueries({ queryKey: ['pins'] });
    qc.invalidateQueries({ queryKey: qk.savedEvents });
  };

  return {
    saveEvent: useMutation({
      mutationFn: async (input: { mapId: string; eventId: string; groupIds: string[]; event?: AtlasEvent; attendance?: Attendance | null }) => {
        if (!input.groupIds.length) throw new Error('Choose at least one group.');
        if (ws.local) {
          if (!input.event) throw new Error('Event details are required to save locally.');
          return ws.local.saveEvent(input.mapId, input.event, input.groupIds, input.attendance ?? null);
        }
        return unwrap(await requireSupabase().rpc('save_event_pin', {
          p_map_id: input.mapId, p_event_id: input.eventId, p_group_ids: input.groupIds,
          p_attendance: input.attendance ?? undefined,
        })) as string;
      },
      onSuccess: invalidatePins,
    }),
    /** Save an OpenStreetMap place to a personal map (group required; one per map). */
    savePlace: useMutation({
      mutationFn: async (input: { mapId: string; place: Place; address: string | null; groupIds: string[]; source?: PinSource | null }) => {
        if (!input.groupIds.length) throw new Error('Choose at least one group.');
        if (ws.local) return ws.local.savePlace(input.mapId, input.place, input.address, input.groupIds, input.source ?? null);
        return unwrap(await requireSupabase().rpc('save_place_pin', {
          p_map_id: input.mapId, p_place_ref: input.place.ref, p_title: input.place.name,
          p_latitude: input.place.latitude, p_longitude: input.place.longitude, p_address: input.address ?? '',
          p_group_ids: input.groupIds, p_source: (input.source ?? undefined) as never,
        })) as string;
      },
      onSuccess: invalidatePins,
    }),
    /** Change attendance on a saved event (owner only; RLS). */
    setAttendance: useMutation({
      mutationFn: async (input: { pinId: string; attendance: Attendance | null }) => {
        if (ws.local) return ws.local.setAttendance(input.pinId, input.attendance);
        unwrap(await requireSupabase().from('pins').update({ attendance: input.attendance }).eq('id', input.pinId).select('id').single());
      },
      onSuccess: invalidatePins,
    }),
    createCustom: useMutation({
      mutationFn: async (input: {
        mapId: string; title: string; note: string; latitude: number; longitude: number;
        address: string | null; groupIds: string[];
        /** From a search result / map place: the OSM element and its source snapshot. */
        placeRef?: string | null; source?: PinSource | null;
      }) => {
        if (!input.groupIds.length) throw new Error('Choose at least one group.');
        if (ws.local) return ws.local.createCustomPin(input);
        return unwrap(await requireSupabase().rpc('create_custom_pin', {
          p_map_id: input.mapId, p_title: input.title, p_note: input.note,
          p_latitude: input.latitude, p_longitude: input.longitude,
          p_address: input.address ?? '', p_group_ids: input.groupIds,
          p_place_ref: input.placeRef ?? undefined, p_source: (input.source ?? undefined) as never,
        })) as string;
      },
      onSuccess: invalidatePins,
    }),
    setGroups: useMutation({
      mutationFn: async (input: { pinId: string; groupIds: string[] }) => {
        if (ws.local) return ws.local.setPinGroups(input.pinId, input.groupIds);
        unwrap(await requireSupabase().rpc('set_pin_groups', { p_pin_id: input.pinId, p_group_ids: input.groupIds }));
      },
      onSuccess: invalidatePins,
    }),
    updateDetails: useMutation({
      mutationFn: async (input: {
        pinId: string; title?: string | null; note?: string | null; address?: string | null;
        /** Custom pins only: new verified location chosen by the owner. */
        latitude?: number; longitude?: number;
        /** Move to another of the owner's maps (RLS checks ownership of the target map). */
        mapId?: string;
      }) => {
        if (ws.local) return ws.local.updatePin(input.pinId, input);
        const patch: Database['public']['Tables']['pins']['Update'] = {};
        if (input.latitude !== undefined && input.longitude !== undefined) {
          patch.latitude = input.latitude;
          patch.longitude = input.longitude;
        }
        if (input.mapId !== undefined) patch.map_id = input.mapId;
        if (input.title !== undefined) patch.title = input.title?.trim() || null;
        if (input.note !== undefined) patch.note = input.note?.trim() || null;
        if (input.address !== undefined) patch.address = input.address?.trim() || null;
        const res = await requireSupabase().from('pins').update(patch).eq('id', input.pinId).select('id').single();
        if (res.error?.code === '23505') throw new Error('That event or place is already saved on the destination map.');
        unwrap(res);
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
        if (ws.local) {
          // Local workspace garbage-collects images nothing references.
          return ws.local.updateAppearance(input.pin.id, a);
        }
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
        if (ws.local) return ws.local.deletePin(pin.id);
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
