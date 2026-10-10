/**
 * Friendly explanations for account-required features. Shown to guests (and
 * inside the tutorial sandbox) instead of an abrupt redirect. Nothing here
 * pretends an action happened; the guest workspace is left untouched.
 */
import { Link, useLocation } from 'react-router-dom';
import { Lock, UserPlus } from 'lucide-react';
import { useAuth } from '@/app/AuthProvider';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';

export const ACCOUNT_REASONS = {
  friends: 'Friend requests connect two real people, so both of you need an Atlas account.',
  collaboration: 'Collaboration maps are stored on Atlas’s servers and shared only with the people the owner invites, so they need an account.',
  invite: 'Invitations add you to someone else’s collaboration map, which needs an account so access can be granted to you specifically.',
  share: 'Sharing a pin with other people needs an account. You can try sharing in the local demo collaboration map instead — nothing is sent.',
  profile: 'Account and privacy settings belong to a signed-in account.',
} as const;

export type AccountReason = keyof typeof ACCOUNT_REASONS;

function signInHref(path: string) {
  return `/auth?next=${encodeURIComponent(path)}`;
}

export function AccountRequiredCard({ reason, title = 'An account is needed for this', children }: {
  reason: AccountReason; title?: string; children?: React.ReactNode;
}) {
  const { configured } = useAuth();
  const loc = useLocation();
  return (
    <section aria-labelledby="account-required-title" className="rounded-2xl bg-white p-5 shadow-panel ring-1 ring-black/5">
      <div className="mb-2 grid size-9 place-items-center rounded-xl bg-neutral-100"><Lock className="size-4" aria-hidden /></div>
      <h2 id="account-required-title" className="text-[15px] font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-neutral-600">{ACCOUNT_REASONS[reason]}</p>
      <p className="mt-2 text-xs text-neutral-500">Your guest maps stay on this device. Signing in won’t upload or change them; you can import them into your account later if you choose.</p>
      {children}
      <div className="mt-4 flex flex-wrap gap-2">
        {configured ? (
          <>
            <Link to={signInHref(loc.pathname + loc.search)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-neutral-900 px-3.5 text-sm font-medium text-white hover:bg-neutral-800">
              <UserPlus className="size-4" aria-hidden />Sign in or create account
            </Link>
          </>
        ) : (
          <p className="text-xs text-neutral-500">Accounts aren’t configured on this deployment.</p>
        )}
        <Link to="/" className="inline-flex h-9 items-center rounded-lg px-3.5 text-sm font-medium text-neutral-700 hover:bg-neutral-200/70">Keep exploring</Link>
      </div>
    </section>
  );
}

/** Modal variant for actions triggered from buttons (e.g. Share). */
export function SignInPromptDialog({ open, onClose, reason, extra }: {
  open: boolean; onClose: () => void; reason: AccountReason; extra?: React.ReactNode;
}) {
  const { configured } = useAuth();
  const loc = useLocation();
  return (
    <Dialog open={open} onClose={onClose} size="sm" title="Sign in to continue"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Not now</Button>
        {configured && <Link to={signInHref(loc.pathname)} className="inline-flex h-9 items-center rounded-lg bg-neutral-900 px-3.5 text-sm font-medium text-white">Sign in or create account</Link>}
      </>}>
      <p className="text-sm text-neutral-700">{ACCOUNT_REASONS[reason]}</p>
      {extra}
      <p className="mt-3 text-xs text-neutral-500">Your guest workspace is kept on this device either way.</p>
    </Dialog>
  );
}
