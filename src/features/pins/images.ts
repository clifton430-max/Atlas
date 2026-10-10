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
  return useQuery({
    queryKey: qk.signedUrl(path ?? ''),
    enabled: !!path,
    staleTime: (SIGNED_URL_TTL_S - 300) * 1000,
    gcTime: SIGNED_URL_TTL_S * 1000,
    retry: 0,
    queryFn: async () => {
      const { data, error } = await requireSupabase().storage.from(PIN_IMAGE_BUCKET).createSignedUrl(path!, SIGNED_URL_TTL_S);
      if (error || !data) throw new Error(error?.message ?? 'Image unavailable');
      return data.signedUrl;
    },
  });
}
