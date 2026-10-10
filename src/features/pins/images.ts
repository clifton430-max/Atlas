/**
 * Pin image storage.
 *
 * Files: private Supabase Storage bucket `pin-images`, path
 *   `<auth.uid()>/<random uuid>.<ext>` (Storage policy confines uploads to the
 *   caller's folder; bucket enforces 2 MB + png/jpeg/webp).
 * Metadata: public.pin_images row (owner, path, mime, size, dimensions).
 *
 * Lifecycle guarantees:
 *   - Upload never overwrites (upsert: false); replacement = new object.
 *   - If the metadata insert fails, the just-uploaded object is removed.
 *   - Deletion removes the metadata row FIRST. That fails (FK) while any pin
 *     or shared representation still references the image, in which case the
 *     file is kept. Only then is the file deleted (Storage policy also refuses
 *     to delete a file that still has a metadata row).
 *   - Delivery uses short-lived signed URLs; Storage checks read permission
 *     (owner, or member of a collaboration map containing a shared pin with it).
 */
import { useQuery } from '@tanstack/react-query';
import { requireSupabase } from '@/lib/supabase';
import { qk } from '@/lib/queryClient';
import type { PinImage } from '@/lib/types';
import { MAX_STORED_IMAGE_BYTES } from '@/lib/validation';
import { useWorkspace, type WorkspaceValue } from '@/features/workspace/WorkspaceProvider';

export const PIN_IMAGE_BUCKET = 'pin-images';
const SIGNED_URL_TTL_S = 60 * 60;

const EXT: Record<string, string> = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' };

export async function uploadPinImage(blob: Blob, dims: { width: number; height: number }): Promise<PinImage> {
  const sb = requireSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error('You need to be signed in to upload images.');
  const ext = EXT[blob.type];
  if (!ext) throw new Error('Unsupported image type.');
  if (blob.size > MAX_STORED_IMAGE_BYTES) throw new Error('The processed image is larger than 2 MB. Try zooming in or choosing a smaller image.');

  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const up = await sb.storage.from(PIN_IMAGE_BUCKET).upload(path, blob, {
    contentType: blob.type, upsert: false, cacheControl: '3600',
  });
  if (up.error) throw new Error(`Upload failed: ${up.error.message}`);

  const { data, error } = await sb.from('pin_images').insert({
    storage_path: path, mime_type: blob.type, byte_size: blob.size, width: dims.width, height: dims.height,
  }).select('id, storage_path, mime_type, byte_size, width, height').single();
  if (error || !data) {
    // Clean up the orphaned object; safe because no row references it.
    await sb.storage.from(PIN_IMAGE_BUCKET).remove([path]);
    throw new Error(`Saving image details failed: ${error?.message ?? 'unknown error'}`);
  }
  return {
    id: data.id, storagePath: data.storage_path, mimeType: data.mime_type,
    byteSize: data.byte_size, width: data.width, height: data.height,
  };
}

/**
 * Delete an image only if nothing references it. Returns true if removed.
 * Never throws for the "still in use" case.
 */
export async function tryDeleteImage(image: Pick<PinImage, 'id' | 'storagePath'>): Promise<boolean> {
  const sb = requireSupabase();
  const { error, count } = await sb.from('pin_images').delete({ count: 'exact' }).eq('id', image.id);
  if (error) {
    // 23503 = foreign_key_violation: still referenced -> keep the file.
    if (error.code === '23503') return false;
    console.warn('[images] metadata delete failed', error.message);
    return false;
  }
  if (!count) return false;
  const rm = await sb.storage.from(PIN_IMAGE_BUCKET).remove([image.storagePath]);
  if (rm.error) console.warn('[images] file delete failed (orphaned object)', rm.error.message);
  return !rm.error;
}

/** Signed URL for a private image; cached a little under its TTL. */
export function useSignedImageUrl(path: string | null | undefined) {
  const ws = useWorkspace();
  const isLocal = !!path?.startsWith('local:');
  return useQuery({
    queryKey: [...qk.signedUrl(path ?? ''), isLocal ? ws.scope : 'storage'],
    enabled: !!path,
    staleTime: (SIGNED_URL_TTL_S - 300) * 1000,
    gcTime: SIGNED_URL_TTL_S * 1000,
    retry: 0,
    queryFn: async () => {
      // Guest/sandbox images live in the local workspace as data URLs.
      if (isLocal) {
        const url = ws.local?.imageDataUrl(path!.slice('local:'.length));
        if (!url) throw new Error('Image unavailable');
        return url;
      }
      const { data, error } = await requireSupabase().storage.from(PIN_IMAGE_BUCKET).createSignedUrl(path!, SIGNED_URL_TTL_S);
      if (error || !data) throw new Error(error?.message ?? 'Image unavailable');
      return data.signedUrl;
    },
  });
}

/**
 * The caller's own unreferenced uploads older than one hour (never in-flight
 * uploads). Listing is restricted server-side to the caller's folder.
 */
export async function listMyOrphanedImages(): Promise<{ name: string; sizeBytes: number }[]> {
  const { data, error } = await requireSupabase().rpc('my_orphaned_pin_images');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ name: r.name, sizeBytes: Number(r.size_bytes) }));
}

/**
 * Delete orphaned uploads. The Storage delete policy independently re-checks
 * that each file is in the caller's folder and has no metadata row, so a file
 * that became referenced in the meantime is never removed.
 */
export async function removeOrphanedImages(names: string[]): Promise<number> {
  if (!names.length) return 0;
  const { data, error } = await requireSupabase().storage.from(PIN_IMAGE_BUCKET).remove(names);
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('The image could not be read.'));
    r.readAsDataURL(blob);
  });
}

/**
 * Store a processed marker image in the ACTIVE workspace:
 * account -> private Supabase Storage (+ metadata row); guest/sandbox -> this browser only.
 */
export async function storeImage(ws: WorkspaceValue, blob: Blob, dims: { width: number; height: number }): Promise<Pick<PinImage, 'id' | 'storagePath'>> {
  if (ws.local) {
    if (blob.size > MAX_STORED_IMAGE_BYTES) throw new Error('The processed image is larger than 2 MB.');
    return ws.local.addImage({ dataUrl: await blobToDataUrl(blob), mimeType: blob.type, byteSize: blob.size, ...dims });
  }
  return uploadPinImage(blob, dims);
}

/** Delete an image from the active workspace if (and only if) nothing references it. */
export async function discardImage(ws: WorkspaceValue, image: Pick<PinImage, 'id' | 'storagePath'>): Promise<boolean> {
  if (ws.local) return ws.local.tryDeleteImage(image.id);
  return tryDeleteImage(image);
}

