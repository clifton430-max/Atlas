/**
 * Pin customization: color, shape, icon, size, border, marker image
 * (upload/crop/fit/mask/replace/remove), reset to default — with a live preview.
 *
 * Only appearance columns change on save. Identity, coordinates, owner, event
 * association, group memberships and permissions are untouched.
 *
 * Image flow: crop locally -> (on Save) upload to Storage + metadata row ->
 * update pin.image_id. If the pin update fails, the freshly uploaded image is
 * removed again. A replaced/removed image is deleted only if no other pin or
 * shared representation still references it.
 */
import { useEffect, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { DEFAULT_APPEARANCE, type Group, type Pin, type PinAppearance, type PinShape } from '@/lib/types';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { ErrorMessage } from '@/components/ui/Feedback';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/components/ui/cn';
import { PinMarkerVisual } from './PinMarkerVisual';
import { PIN_ICONS } from './icons';
import { ImageCropper, MaskChooser, type CroppedImage } from './ImageCropper';
import { discardImage, storeImage, useSignedImageUrl } from './images';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { pinTitle, usePinMutations } from './api';

const SHAPES: { id: PinShape; label: string }[] = [
  { id: 'circle', label: 'Circle' },
  { id: 'square', label: 'Square' },
  { id: 'rounded', label: 'Rounded square' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'star', label: 'Star' },
];

export function PinAppearanceDialog({ pin, groups, onClose }: { pin: Pin; groups: Group[]; onClose: () => void }) {
  const toast = useToast();
  const ws = useWorkspace();
  const { updateAppearance } = usePinMutations();
  const [draft, setDraft] = useState<PinAppearance>(pin.appearance);
  const [newImage, setNewImage] = useState<CroppedImage | null>(null);
  const [cropping, setCropping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const existingUrl = useSignedImageUrl(pin.image?.storagePath);

  useEffect(() => () => { if (newImage) URL.revokeObjectURL(newImage.previewUrl); }, [newImage]);

  const set = (patch: Partial<PinAppearance>) => setDraft((d) => ({ ...d, ...patch }));
  const usingImage = !!newImage || !!draft.imageId;
  const previewUrl = newImage?.previewUrl ?? (draft.imageId === pin.image?.id ? existingUrl.data ?? null : null);
  const groupColors = groups.filter((g) => pin.groupIds.includes(g.id)).map((g) => g.color);
  const fallbackIcon = pin.kind === 'event' ? 'ticket' : 'map-pin';

  const save = async () => {
    setBusy(true);
    setError(null);
    let uploaded: { id: string; storagePath: string } | null = null;
    try {
      let appearance = draft;
      if (newImage) {
        uploaded = await storeImage(ws, newImage.blob, { width: newImage.width, height: newImage.height });
        appearance = { ...draft, imageId: uploaded.id };
      }
      await updateAppearance.mutateAsync({ pin, appearance });
      toast.success('Pin appearance saved.');
      onClose();
    } catch (e) {
      if (uploaded) await discardImage(ws, uploaded).catch(() => undefined);
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      size="lg"
      onClose={onClose}
      dismissible={!busy}
      title="Customize pin"
      description={pinTitle(pin)}
      footer={
        <>
          <Button
            variant="ghost"
            className="mr-auto"
            onClick={() => { setDraft(DEFAULT_APPEARANCE); setNewImage(null); setCropping(false); }}
            disabled={busy}
          >
            Reset to default
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy} disabled={cropping}>Save appearance</Button>
        </>
      }
    >
      <div className="grid grid-cols-[180px_1fr] gap-6">
        {/* Live preview on a map-like backdrop */}
        <div className="sticky top-0 self-start">
          <div className="grid h-44 place-items-center rounded-xl bg-[linear-gradient(135deg,#eef0ea,#e4e7e0)] ring-1 ring-neutral-200" aria-label="Live preview" role="img">
            <PinMarkerVisual
              appearance={newImage ? { ...draft, imageId: 'pending' } : draft}
              imageUrl={previewUrl}
              imageLoading={!newImage && !!draft.imageId && existingUrl.isLoading}
              fallbackIcon={fallbackIcon}
              groupColors={groupColors}
            />
          </div>
          <p className="mt-2 text-center text-xs text-neutral-500">Live preview</p>
        </div>

        <div className="space-y-5">
          <section className="space-y-2">
            <h3 className="text-[13px] font-medium text-neutral-700">Marker image</h3>
            {cropping ? (
              <ImageCropper
                mask={draft.imageMask}
                onMaskChange={(m) => set({ imageMask: m })}
                onCancel={() => setCropping(false)}
                onConfirm={(img) => { setNewImage(img); setCropping(false); }}
              />
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" icon={<ImagePlus className="size-4" aria-hidden />} onClick={() => setCropping(true)}>
                  {usingImage ? 'Replace image' : 'Upload image'}
                </Button>
                {usingImage && (
                  <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden />}
                    onClick={() => { setNewImage(null); set({ imageId: null }); }}>
                    Remove image
                  </Button>
                )}
                {usingImage && <MaskChooser value={draft.imageMask} onChange={(m) => set({ imageMask: m })} />}
              </div>
            )}
            {usingImage && !cropping && (
              <p className="text-xs text-neutral-500">The image becomes the marker itself. Shape and icon apply when no image is set.</p>
            )}
            {!newImage && draft.imageId && existingUrl.isError && (
              <p className="text-xs text-danger">The current image file could not be loaded. Replace or remove it.</p>
            )}
          </section>

          <fieldset className={cn(usingImage && 'opacity-50')} disabled={usingImage}>
            <legend className="mb-1.5 text-[13px] font-medium text-neutral-700">Shape</legend>
            <div className="flex flex-wrap gap-1.5">
              {SHAPES.map((s) => (
                <button key={s.id} type="button" aria-pressed={draft.shape === s.id} onClick={() => set({ shape: s.id })}
                  className={cn('rounded-lg p-1.5 ring-1', draft.shape === s.id ? 'bg-neutral-900 ring-neutral-900' : 'bg-white ring-neutral-300 hover:ring-neutral-400')}
                  aria-label={s.label} title={s.label}>
                  <span className="block size-7">
                    <PinMarkerVisual appearance={{ ...DEFAULT_APPEARANCE, shape: s.id, size: 28, color: draft.shape === s.id ? '#ffffff' : '#404040', borderWidth: 0 }} fallbackIcon={fallbackIcon} />
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className={cn(usingImage && 'pointer-events-none opacity-50')} aria-disabled={usingImage}>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[13px] font-medium text-neutral-700">Fill color</span>
              <button type="button" className="text-xs text-neutral-500 underline" onClick={() => set({ color: null })} disabled={usingImage}>Use default</button>
            </div>
            <ColorPicker label="Fill color" hideLegend value={draft.color} onChange={(c) => set({ color: c })} />
          </div>

          <fieldset className={cn(usingImage && 'opacity-50')} disabled={usingImage}>
            <legend className="mb-1.5 text-[13px] font-medium text-neutral-700">Icon</legend>
            <div className="grid grid-cols-10 gap-1">
              {Object.entries(PIN_ICONS).map(([key, { label, Icon }]) => (
                <button key={key} type="button" aria-label={label} title={label} aria-pressed={draft.icon === key}
                  onClick={() => set({ icon: key })}
                  className={cn('grid size-8 place-items-center rounded-md ring-1', draft.icon === key ? 'bg-neutral-900 text-white ring-neutral-900' : 'bg-white text-neutral-700 ring-neutral-200 hover:ring-neutral-400')}>
                  <Icon className="size-4" aria-hidden />
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-4">
            <label className="block text-[13px] font-medium text-neutral-700">
              Size <span className="font-normal text-neutral-500">{draft.size}px</span>
              <input type="range" min={20} max={72} value={draft.size} onChange={(e) => set({ size: Number(e.target.value) })} className="mt-1 w-full accent-neutral-900" />
            </label>
            <label className="block text-[13px] font-medium text-neutral-700">
              Border width <span className="font-normal text-neutral-500">{draft.borderWidth}px</span>
              <input type="range" min={0} max={6} value={draft.borderWidth} onChange={(e) => set({ borderWidth: Number(e.target.value) })} className="mt-1 w-full accent-neutral-900" />
            </label>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[13px] font-medium text-neutral-700">Border / outline color</span>
              <button type="button" className="text-xs text-neutral-500 underline" onClick={() => set({ borderColor: null })}>Use default (white)</button>
            </div>
            <ColorPicker label="Border color" hideLegend value={draft.borderColor} onChange={(c) => set({ borderColor: c })} />
          </div>

          <ErrorMessage error={error} />
        </div>
      </div>
    </Dialog>
  );
}
