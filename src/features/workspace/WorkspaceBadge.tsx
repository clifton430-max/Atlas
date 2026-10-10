/**
 * Always-visible indicator of where personal data lives right now.
 *   Guest   -> "Guest · saved on this device"
 *   Sandbox -> "Tutorial sandbox · practice data"
 *   Account -> nothing (normal signed-in state)
 */
import { Link } from 'react-router-dom';
import { HardDrive, GraduationCap } from 'lucide-react';
import { Popover } from '@/components/ui/Popover';
import { useAuth } from '@/app/AuthProvider';
import { useWorkspace } from './WorkspaceProvider';

export function WorkspaceBadge() {
  const ws = useWorkspace();
  const { configured } = useAuth();
  if (ws.mode === 'account') return null;
  const sandbox = ws.mode === 'sandbox';
  return (
    <Popover align="left" label={sandbox ? 'About the tutorial sandbox' : 'About Guest Mode'} trigger={({ open, toggle, id }) => (
      <button type="button" aria-expanded={open} aria-controls={id} onClick={toggle} data-tour="workspace-badge"
        className={sandbox
          ? 'flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-strong'
          : 'flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-200'}>
        {sandbox ? <GraduationCap className="size-3.5" aria-hidden /> : <HardDrive className="size-3.5" aria-hidden />}
        {sandbox ? 'Tutorial sandbox' : 'Guest · on this device'}
      </button>
    )}>
      <div className="w-72 space-y-2 p-4 text-sm text-neutral-700">
        {sandbox ? (
          <>
            <p className="font-medium text-neutral-900">You’re practising in a sandbox.</p>
            <p>Maps, groups and pins you create during the tour are temporary and are discarded when the tour ends. Your real data is not changed.</p>
          </>
        ) : (
          <>
            <p className="font-medium text-neutral-900">You’re using Atlas as a guest.</p>
            <p>Your maps, groups, pins and images are saved only in this browser on this device. They aren’t uploaded anywhere.</p>
            {!ws.local?.persistent && <p className="text-danger">This browser isn’t allowing storage, so guest data will be lost when you close the page.</p>}
            <p>Friends and real collaboration need an account{configured ? '' : ' (not configured on this deployment)'}.</p>
            <div className="flex gap-3 pt-1 text-xs">
              <Link to="/settings/guest" className="font-medium underline">Guest data & reset</Link>
              {configured && <Link to="/auth" className="font-medium underline">Sign in</Link>}
            </div>
          </>
        )}
      </div>
    </Popover>
  );
}
