/**
 * Share a private pin into a collaboration map. Three explicit steps:
 *   1. choose a destination (only maps where I'm owner/editor are offered;
 *      the server re-checks the role),
 *   2. review exactly what will be shared (note and custom image are opt-in
 *      toggles; the private original stays private),
 *   3. confirm -> share_pin() creates an independent shared representation.
 */
import { useState } from 'react';
import { Check, Lock } from 'lucide-react';
import type { Pin } from '@/lib/types';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Badge, EmptyState, ErrorMessage, Spinner } from '@/components/ui/Feedback';
import { Switch } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/components/ui/cn';
import { pinTitle } from '@/features/pins/api';
import { useCollabMaps, useCollabMutations, usePinShares } from './api';

export function SharePinDialog({ pin, onClose }: { pin: Pin; onClose: () => void }) {
  const toast = useToast();
  const maps = useCollabMaps();
  const shares = usePinShares(pin.id);
  const { sharePin } = useCollabMutations();
  const [step, setStep] = useState<'destination' | 'review'>('destination');
  const [destId, setDestId] = useState<string | null>(null);
  const [includeNote, setIncludeNote] = useState(false);
  const [includeAppearance, setIncludeAppearance] = useState(true);

  const writable = (maps.data ?? []).filter((m) => m.myRole === 'owner' || m.myRole === 'editor');
  const dest = writable.find((m) => m.id === destId) ?? null;
  const alreadyShared = shares.data?.some((s) => s.collabMapId === destId);
  const hasLocation = pin.latitude != null && pin.longitude != null;

  const confirm = async () => {
    if (!dest) return;
    try {
      await sharePin.mutateAsync({ pinId: pin.id, collabMapId: dest.id, includeNote, includeAppearance });
      toast.success(`Shared to ${dest.name}.`);
      onClose();
    } catch {
      /* error shown below */
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={!sharePin.isPending}
      title={step === 'destination' ? 'Share pin — choose destination' : 'Share pin — review'}
      description={pinTitle(pin)}
      footer={
        step === 'destination' ? (
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={!dest || !hasLocation} onClick={() => setStep('review')}>Review</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setStep('destination')} disabled={sharePin.isPending}>Back</Button>
            <Button variant="primary" onClick={confirm} loading={sharePin.isPending}>
              {alreadyShared ? 'Update shared copy' : 'Share'}
            </Button>
          </>
        )
      }
    >
      {step === 'destination' ? (
        maps.isLoading ? <Spinner /> : maps.error ? <ErrorMessage error={maps.error} /> : (
          <div className="space-y-2">
            {!hasLocation && <ErrorMessage error="This pin has no verified location, so it can’t be shared to a map." />}
            {writable.length === 0 ? (
              <EmptyState title="No collaboration maps you can add to">
                Create a collaboration map in the right panel, or ask an owner for editor access.
              </EmptyState>
            ) : (
              <ul className="space-y-1" role="radiogroup" aria-label="Destination collaboration map">
                {writable.map((m) => {
                  const shared = shares.data?.some((s) => s.collabMapId === m.id);
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={destId === m.id}
                        onClick={() => setDestId(m.id)}
                        className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ring-1',
                          destId === m.id ? 'bg-neutral-900 text-white ring-neutral-900' : 'ring-neutral-200 hover:bg-neutral-50')}
                      >
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.name}</span>
                        {shared && <span className="text-xs opacity-80">Already shared</span>}
                        <Badge>{m.myRole}</Badge>
                        {destId === m.id && <Check className="size-4" aria-hidden />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg bg-neutral-50 p-3 text-sm">
            <p className="font-medium">Members of “{dest?.name}” will see:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-neutral-700">
              <li>Title: {pinTitle(pin)}</li>
              <li>Location: {pin.latitude?.toFixed(5)}, {pin.longitude?.toFixed(5)}{pin.address || pin.event?.venueName ? ` (${pin.address ?? pin.event?.venueName})` : ''}</li>
              {pin.event && <li>Linked public event: {pin.event.name}</li>}
              <li>Your username as the person who shared it</li>
              {includeNote && pin.note && <li>Your note: “{pin.note.slice(0, 120)}{pin.note.length > 120 ? '…' : ''}”</li>}
              {includeAppearance && <li>Your custom marker style{pin.appearance.imageId ? ' and image' : ''}</li>}
            </ul>
          </div>
          <Switch
            label="Include my private note"
            description={pin.note ? 'Off by default. The note is copied; later edits are not synced.' : 'This pin has no note.'}
            checked={includeNote && !!pin.note}
            onChange={setIncludeNote}
            disabled={!pin.note}
          />
          <Switch
            label="Include custom appearance and image"
            description="Members can view the image only while it is shared with them."
            checked={includeAppearance}
            onChange={setIncludeAppearance}
          />
          <p className="flex items-start gap-2 text-xs text-neutral-500">
            <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Your original pin, its groups and its map stay private. Removing the shared copy later won’t affect the original.
          </p>
          <ErrorMessage error={sharePin.error} />
        </div>
      )}
    </Dialog>
  );
}
