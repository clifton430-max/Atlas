/**
 * Image selection + crop/reposition/fit/mask editor for marker images.
 *
 * - Validates type (png/jpeg/webp) and size before decoding.
 * - Drag (pointer) or arrow keys reposition; slider zooms; Fill/Fit toggles.
 * - The mask preview matches how the marker will be clipped on the map.
 * - On confirm, renders a 256×256 WebP (PNG fallback) via canvas and hands the
 *   blob back. Nothing is uploaded here — the caller uploads on Save.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ImagePlus, RotateCcw } from 'lucide-react';
import type { ImageMask } from '@/lib/types';
import { validateImageFile } from '@/lib/validation';
import { Button } from '@/components/ui/Button';
import { ErrorMessage } from '@/components/ui/Feedback';
import { cn } from '@/components/ui/cn';
import { clampOffset, drawRect, INITIAL_CROP, scaleCrop, type CropState } from './cropMath';

const PREVIEW = 200;
const OUTPUT = 256;
const maskRadius: Record<ImageMask, string> = { circle: '50%', rounded: '24%', square: '6%' };

export interface CroppedImage { blob: Blob; width: number; height: number; previewUrl: string }

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file could not be read as an image.'));
    img.src = src;
  });
}

async function render(img: HTMLImageElement, crop: CropState): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT;
  canvas.height = OUTPUT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image processing is not supported in this browser.');
  ctx.imageSmoothingQuality = 'high';
  const r = drawRect({ width: img.naturalWidth, height: img.naturalHeight }, scaleCrop(crop, PREVIEW, OUTPUT), OUTPUT);
  ctx.drawImage(img, r.x, r.y, r.width, r.height);
  const toBlob = (type: string) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.9));
  let blob = await toBlob('image/webp');
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/png');
  if (!blob) throw new Error('The image could not be processed.');
  return blob;
}

export function ImageCropper({ mask, onMaskChange, onConfirm, onCancel }: {
  mask: ImageMask;
  onMaskChange: (m: ImageMask) => void;
  onConfirm: (img: CroppedImage) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<CropState>(INITIAL_CROP);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);

  const pick = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    const v = validateImageFile(file);
    if (!v.ok) return setError(v.error);
    const url = URL.createObjectURL(file);
    try {
      const el = await loadImage(url);
      if (el.naturalWidth < 16 || el.naturalHeight < 16) throw new Error('That image is too small (minimum 16×16).');
      setSrc(url);
      setImg(el);
      setCrop(INITIAL_CROP);
    } catch (e) {
      URL.revokeObjectURL(url);
      setError((e as Error).message);
    }
  };

  const update = (next: CropState) => img && setCrop(clampOffset({ width: img.naturalWidth, height: img.naturalHeight }, next, PREVIEW));

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: crop.offsetX, oy: crop.offsetY };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    update({ ...crop, offsetX: drag.current.ox + e.clientX - drag.current.x, offsetY: drag.current.oy + e.clientY - drag.current.y });
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 16 : 4;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (d[e.key]) {
      e.preventDefault();
      update({ ...crop, offsetX: crop.offsetX + d[e.key][0], offsetY: crop.offsetY + d[e.key][1] });
    }
  };

  const confirm = async () => {
    if (!img) return;
    setBusy(true);
    try {
      const blob = await render(img, crop);
      onConfirm({ blob, width: OUTPUT, height: OUTPUT, previewUrl: URL.createObjectURL(blob) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rect = img ? drawRect({ width: img.naturalWidth, height: img.naturalHeight }, crop, PREVIEW) : null;

  return (
    <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label="Choose marker image"
        onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }}
      />
      {!img ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-1 rounded-lg border-2 border-dashed border-neutral-300 bg-white px-4 py-6 text-sm text-neutral-600 hover:border-neutral-400"
        >
          <ImagePlus className="size-6 text-neutral-400" aria-hidden />
          Choose an image
          <span className="text-xs text-neutral-500">PNG, JPEG or WebP · up to 10 MB</span>
        </button>
      ) : (
        <div className="flex gap-4">
          <div
            role="application"
            aria-label="Image position. Drag or use arrow keys to reposition."
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => (drag.current = null)}
            onKeyDown={onKey}
            className="relative shrink-0 cursor-grab touch-none overflow-hidden bg-[repeating-conic-gradient(#e5e5e5_0_25%,#fff_0_50%)] bg-[length:16px_16px] active:cursor-grabbing"
            style={{ width: PREVIEW, height: PREVIEW, borderRadius: maskRadius[mask] }}
          >
            {rect && (
              <img
                src={src!}
                alt="Crop preview"
                draggable={false}
                className="pointer-events-none absolute max-w-none select-none"
                style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
              />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <label className="block text-xs font-medium text-neutral-700">
              Zoom
              <input type="range" min={1} max={4} step={0.01} value={crop.zoom}
                onChange={(e) => update({ ...crop, zoom: Number(e.target.value) })} className="mt-1 w-full accent-neutral-900" />
            </label>
            <fieldset>
              <legend className="mb-1 text-xs font-medium text-neutral-700">Fit</legend>
              <div className="flex gap-1">
                {(['cover', 'contain'] as const).map((f) => (
                  <button key={f} type="button" aria-pressed={crop.fit === f} onClick={() => update({ ...crop, fit: f, offsetX: 0, offsetY: 0 })}
                    className={cn('h-7 rounded-md px-2.5 text-xs font-medium', crop.fit === f ? 'bg-neutral-900 text-white' : 'bg-white ring-1 ring-neutral-300')}>
                    {f === 'cover' ? 'Fill' : 'Fit whole image'}
                  </button>
                ))}
              </div>
            </fieldset>
            <MaskChooser value={mask} onChange={onMaskChange} />
            <div className="flex flex-wrap gap-1">
              <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" aria-hidden />} onClick={() => setCrop(INITIAL_CROP)}>Reset position</Button>
              <Button size="sm" variant="ghost" onClick={() => inputRef.current?.click()}>Choose another</Button>
            </div>
          </div>
        </div>
      )}
      {error && <ErrorMessage error={error} />}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button size="sm" variant="primary" onClick={confirm} disabled={!img} loading={busy}>Use this image</Button>
      </div>
    </div>
  );
}

export function MaskChooser({ value, onChange }: { value: ImageMask; onChange: (m: ImageMask) => void }) {
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-medium text-neutral-700">Mask</legend>
      <div className="flex gap-1">
        {(['circle', 'rounded', 'square'] as const).map((m) => (
          <button key={m} type="button" aria-pressed={value === m} onClick={() => onChange(m)}
            className={cn('flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium capitalize', value === m ? 'bg-neutral-900 text-white' : 'bg-white ring-1 ring-neutral-300')}>
            <span className="block size-3 border-[1.5px] border-current" style={{ borderRadius: maskRadius[m] }} aria-hidden />
            {m}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
