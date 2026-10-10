/**
 * Crop geometry shared by the live preview (CSS) and the final canvas render,
 * so what the user sees is exactly what gets uploaded.
 *
 * Coordinates are in output pixels of a square frame of size `frame`.
 * - fit 'cover'   : image fills the square (may crop edges)
 * - fit 'contain' : whole image visible (transparent padding)
 * zoom multiplies the base scale; offset moves the image (in frame pixels).
 */
export type FitMode = 'cover' | 'contain';

export interface CropState {
  fit: FitMode;
  zoom: number;
  offsetX: number;
  offsetY: number;
}

export const INITIAL_CROP: CropState = { fit: 'cover', zoom: 1, offsetX: 0, offsetY: 0 };

export function drawRect(natural: { width: number; height: number }, crop: CropState, frame: number) {
  const base = crop.fit === 'cover'
    ? Math.max(frame / natural.width, frame / natural.height)
    : Math.min(frame / natural.width, frame / natural.height);
  const scale = base * crop.zoom;
  const width = natural.width * scale;
  const height = natural.height * scale;
  return {
    x: (frame - width) / 2 + crop.offsetX,
    y: (frame - height) / 2 + crop.offsetY,
    width,
    height,
  };
}

/** Keep the image overlapping the frame so it can't be dragged away entirely. */
export function clampOffset(natural: { width: number; height: number }, crop: CropState, frame: number): CropState {
  const r = drawRect(natural, { ...crop, offsetX: 0, offsetY: 0 }, frame);
  // In cover mode, never reveal empty edges; in contain mode allow movement within half a frame.
  const maxX = crop.fit === 'cover' ? Math.max(0, (r.width - frame) / 2) : Math.max(frame / 2, (r.width - frame) / 2);
  const maxY = crop.fit === 'cover' ? Math.max(0, (r.height - frame) / 2) : Math.max(frame / 2, (r.height - frame) / 2);
  return {
    ...crop,
    offsetX: Math.max(-maxX, Math.min(maxX, crop.offsetX)),
    offsetY: Math.max(-maxY, Math.min(maxY, crop.offsetY)),
  };
}

/** Scale offsets from preview-frame pixels to output-frame pixels. */
export function scaleCrop(crop: CropState, from: number, to: number): CropState {
  const k = to / from;
  return { ...crop, offsetX: crop.offsetX * k, offsetY: crop.offsetY * k };
}
