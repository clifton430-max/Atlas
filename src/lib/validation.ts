/**
 * Input validation helpers shared by forms and API modules. Server-side
 * constraints (CHECKs, RLS, RPC validation) remain authoritative; these give
 * fast, friendly feedback and protect rendering (e.g. unsafe URLs).
 */

/**
 * Returns a normalized https URL if it is safe to render as a link, else null.
 * Rejects javascript:, data:, http:, credentials-in-URL and malformed input.
 */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
export const isHexColor = (v: string | null | undefined): v is string => !!v && HEX_COLOR.test(v);

export const USERNAME = /^[a-z0-9_]{3,30}$/;

export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
/** Max size of a *source* file the user picks (it is re-encoded before upload). */
export const MAX_SOURCE_IMAGE_BYTES = 10 * 1024 * 1024;
/** Max size of the processed marker image stored in Storage (bucket limit). */
export const MAX_STORED_IMAGE_BYTES = 2 * 1024 * 1024;

export type ImageValidation = { ok: true } | { ok: false; error: string };

export function validateImageFile(file: { type: string; size: number }): ImageValidation {
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, error: 'Choose a PNG, JPEG or WebP image.' };
  }
  if (file.size <= 0) return { ok: false, error: 'That file is empty.' };
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    return { ok: false, error: 'Images must be 10 MB or smaller.' };
  }
  return { ok: true };
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  );
}
