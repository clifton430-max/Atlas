/**
 * Share-to-demo flow for guests and the tutorial sandbox. Same steps as the
 * real flow (destination -> review -> confirm), but the destination is the
 * local demo map and the result stays on this device.
 */
import { useState } from 'react';
import { FlaskConical, Lock } from 'lucide-react';
import type { Pin } from '@/lib/types';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Badge, ErrorMessage } from '@/components/ui/Feedback';
import { Switch } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { useLocalSnapshot } from '@/features/workspace/useLocalSnapshot';
import { pinTitle } from '@/features/pins/api';

export function LocalShareDialog({ pin, onClose }: { pin: Pin; onClose: () => void }) {
  const ws = useWorkspace();
  const snap = useLocalSnapshot(ws.local);
  const toast = useToast();
  const [step, setStep] = useState<'destination' | 'review'>('destination');
  const [includeNote, setIncludeNote] = useState(false);
  const [includeAppearance, setIncludeAppearance] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const mapName = snap?.demo.mapName ?? 'Demo map';

  const confirm = () => {
    try {
      ws.local!.shareToDemo(pin.id, { includeNote, includeAppearance });
      toast.success('Shared a copy to the demo map (only on this device).');
      onClose();
    } catch (e) { setError(e); }
  };

  return (
    <Dialog open onClose={onClose} title={step === 'destination' ? 'Share pin — choose destination' : 'Share pin — review'} description={pinTitle(pin)}
      footer={step === 'destination'
        ? <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => setStep('review')} disabled={pin.latitude == null}>Review</Button></>
        : <><Button variant="ghost" onClick={() => setStep('destination')}>Back</Button><Button variant="primary" onClick={confirm}>Share to demo</Button></>}>
      {step === 'destination' ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-lg bg-neutral-900 px-3 py-2 text-white" role="radio" aria-checked="true">
            <FlaskConical className="size-4" aria-hidden /><span className="flex-1 text-sm font-medium">{mapName}</span><Badge tone="warning">Demo</Badge>
          </div>
          <p className="text-xs text-neutral-500">Sharing with real people needs an account. This demo stays on your device and nothing is sent.</p>
          {pin.latitude == null && <ErrorMessage error="This pin has no verified location, so it can’t be shared to a map." />}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg bg-neutral-50 p-3 text-sm">
            <p className="font-medium">A copy in “{mapName}” would show:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-neutral-700">
              <li>Title: {pinTitle(pin)}</li>
              <li>Location: {pin.latitude?.toFixed(5)}, {pin.longitude?.toFixed(5)}</li>
              {includeNote && pin.note && <li>Your note</li>}
              {includeAppearance && <li>Your custom marker style{pin.appearance.imageId ? ' and image' : ''}</li>}
            </ul>
          </div>
          <Switch label="Include my private note" checked={includeNote && !!pin.note} onChange={setIncludeNote} disabled={!pin.note}
            description={pin.note ? 'Off by default.' : 'This pin has no note.'} />
          <Switch label="Include custom appearance and image" checked={includeAppearance} onChange={setIncludeAppearance} />
          <p className="flex items-start gap-2 text-xs text-neutral-500"><Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />Your original pin, its groups and its map are not shared. Removing the copy later won’t affect the original.</p>
          <ErrorMessage error={error} />
        </div>
      )}
    </Dialog>
  );
}
