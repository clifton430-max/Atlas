/**
 * Explicit, user-initiated import of the guest workspace into the signed-in
 * account. Never runs automatically.
 *
 * Safety rules:
 *   - Insert-only: existing account maps, pins and groups are never modified
 *     or overwritten. Imported maps get a "(from guest)" suffix.
 *   - Groups are matched by name (case-insensitive); an existing group is
 *     reused as-is, otherwise a new group is created.
 *   - Everything goes through the normal RLS-protected API and RPCs as the
 *     signed-in user, so ownership is assigned by the server (auth.uid()), not
 *     by anything in the local data.
 *   - Event pins are imported only if the public event exists on the server;
 *     local-only events (e.g. development samples) are skipped and reported.
 *   - Images are re-uploaded through the private Storage path.
 *   - Guest data is left untouched; the user can clear it separately.
 */
import type { AtlasClient } from '@/lib/supabase';
import { uploadPinImage, tryDeleteImage } from '@/features/pins/images';
import type { LocalWorkspace } from './localWorkspace';

export interface ImportSummary {
  mapsCreated: number;
  groupsCreated: number;
  groupsReused: number;
  pinsImported: number;
  imagesUploaded: number;
  skipped: string[];
}

const IMPORTED_GROUP = { name: 'Imported', color: '#525252' };

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

export async function importGuestData(local: LocalWorkspace, sb: AtlasClient): Promise<ImportSummary> {
  const snap = local.snapshot();
  const summary: ImportSummary = { mapsCreated: 0, groupsCreated: 0, groupsReused: 0, pinsImported: 0, imagesUploaded: 0, skipped: [] };

  // ---- Groups: reuse by name, otherwise create -----------------------------
  const { data: existing, error: gErr } = await sb.from('groups').select('id, name');
  if (gErr) throw new Error(gErr.message);
  const byName = new Map((existing ?? []).map((g) => [g.name.trim().toLowerCase(), g.id]));
  const groupMap = new Map<string, string>();
  const ensureGroup = async (name: string, color: string, icon: string | null): Promise<string> => {
    const key = name.trim().toLowerCase();
    const found = byName.get(key);
    if (found) {
      summary.groupsReused++;
      return found;
    }
    const { data, error } = await sb.from('groups').insert({ name: name.trim(), color, icon }).select('id').single();
    if (error || !data) throw new Error(error?.message ?? 'Group creation failed');
    byName.set(key, data.id);
    summary.groupsCreated++;
    return data.id;
  };
  for (const g of snap.groups) {
    try {
      groupMap.set(g.id, await ensureGroup(g.name, g.color, g.icon));
    } catch (e) {
      summary.skipped.push(`Group “${g.name}”: ${(e as Error).message}`);
    }
  }

  // ---- Which saved events exist on the server? ------------------------------
  const eventIds = [...new Set(snap.pins.filter((p) => p.kind === 'event' && p.eventId).map((p) => p.eventId!))];
  const serverEvents = new Set<string>();
  for (let i = 0; i < eventIds.length; i += 100) {
    const { data } = await sb.from('events').select('id').in('id', eventIds.slice(i, i + 100));
    for (const e of data ?? []) serverEvents.add(e.id);
  }

  // ---- Maps and pins ---------------------------------------------------------
  let fallbackGroup: string | null = null;
  for (const m of snap.maps) {
    const name = `${m.name} (from guest)`.slice(0, 80);
    const { data: created, error } = await sb.from('maps').insert({ name, description: m.description }).select('id').single();
    if (error || !created) {
      summary.skipped.push(`Map “${m.name}”: ${error?.message ?? 'could not be created'}`);
      continue;
    }
    summary.mapsCreated++;

    for (const p of snap.pins.filter((x) => x.mapId === m.id)) {
      const label = p.title ?? p.event?.name ?? 'Untitled pin';
      try {
        let groupIds = p.groupIds.map((g) => groupMap.get(g)).filter((g): g is string => !!g);
        if (!groupIds.length) {
          // The server requires at least one group when saving.
          fallbackGroup ??= await ensureGroup(IMPORTED_GROUP.name, IMPORTED_GROUP.color, null);
          groupIds = [fallbackGroup];
        }
        let pinId: string;
        if (p.kind === 'event') {
          if (!p.eventId || !serverEvents.has(p.eventId)) {
            summary.skipped.push(`“${label}”: this event isn’t available on the server (for example a development sample).`);
            continue;
          }
          const r = await sb.rpc('save_event_pin', { p_map_id: created.id, p_event_id: p.eventId, p_group_ids: groupIds });
          if (r.error) throw new Error(r.error.message);
          pinId = r.data as string;
          if (p.title || p.note) await sb.from('pins').update({ title: p.title, note: p.note }).eq('id', pinId);
        } else {
          const r = await sb.rpc('create_custom_pin', {
            p_map_id: created.id, p_title: p.title!, p_note: p.note ?? '', p_latitude: p.latitude!, p_longitude: p.longitude!,
            p_address: p.address ?? '', p_group_ids: groupIds,
          });
          if (r.error) throw new Error(r.error.message);
          pinId = r.data as string;
        }

        // Appearance (+ image re-uploaded to private Storage).
        const a = p.appearance;
        let imageId: string | null = null;
        if (a.imageId) {
          const dataUrl = local.imageDataUrl(a.imageId);
          if (dataUrl) {
            const blob = await dataUrlToBlob(dataUrl);
            const img = snap.images.find((i) => i.id === a.imageId)!;
            const uploaded = await uploadPinImage(blob, { width: img.width, height: img.height });
            imageId = uploaded.id;
            summary.imagesUploaded++;
            const upd = await sb.from('pins').update({ image_id: imageId }).eq('id', pinId);
            if (upd.error) {
              await tryDeleteImage(uploaded);
              throw new Error(upd.error.message);
            }
          }
        }
        const app = await sb.from('pins').update({
          color: a.color, shape: a.shape, icon: a.icon, size: a.size, border_color: a.borderColor,
          border_width: a.borderWidth, image_mask: a.imageMask,
        }).eq('id', pinId);
        if (app.error) throw new Error(app.error.message);
        summary.pinsImported++;
      } catch (e) {
        summary.skipped.push(`“${label}”: ${(e as Error).message}`);
      }
    }
  }
  return summary;
}
