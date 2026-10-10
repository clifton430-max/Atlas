/**
 * /invite/:token — resolves invitation links and QR codes. Shows a preview
 * (map, inviter, role, expiry) and requires an explicit Accept. Every check
 * (validity, expiry, revocation, use limits, intended recipient) runs in the
 * database; this page only renders the outcome.
 */
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ErrorMessage, Spinner } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { previewInvitation, useCollabMutations, type InvitePreview } from './api';

const STATUS_TEXT: Record<Exclude<InvitePreview['status'], 'valid' | 'already_member'>, string> = {
  invalid: 'This invitation link is not valid.',
  revoked: 'This invitation was revoked by the map owner.',
  declined: 'This invitation was declined.',
  expired: 'This invitation has expired. Ask the owner for a new link.',
  used: 'This invitation has already been used the maximum number of times.',
  wrong_recipient: 'This invitation was created for a different person.',
};

export function InvitePage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { acceptToken } = useCollabMutations();
  const preview = useQuery({ queryKey: ['invitePreview', token], queryFn: () => previewInvitation(token), retry: 0 });
  const p = preview.data;

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-neutral-900/20 p-6 backdrop-blur-[1px]">
      <section aria-labelledby="invite-title" className="w-[420px] rounded-2xl bg-white p-6 shadow-float">
        <div className="mb-3 grid size-10 place-items-center rounded-xl bg-neutral-100"><Users className="size-5" aria-hidden /></div>
        <h1 id="invite-title" className="text-lg font-semibold">Collaboration invitation</h1>
        {preview.isLoading ? <Spinner className="mt-4" label="Checking invitation" /> : preview.error ? <ErrorMessage className="mt-4" error={preview.error} /> : p && (
          p.status === 'valid' ? (
            <>
              <p className="mt-2 text-sm text-neutral-700">
                <strong>{p.inviterName}</strong> invited you to join <strong>{p.mapName}</strong> as <strong>{p.role}</strong>.
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {p.role === 'editor' ? 'Editors can view shared pins and share their own pins into this map.' : 'Viewers can view pins shared into this map.'}
                {' '}Joining does not share any of your private maps or pins. Expires {p.expiresAt && new Date(p.expiresAt).toLocaleString()}.
              </p>
              <ErrorMessage className="mt-3" error={acceptToken.error} />
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => navigate('/')}>Not now</Button>
                <Button variant="primary" loading={acceptToken.isPending} onClick={() => acceptToken.mutate(token, {
                  onSuccess: (mapId) => { toast.success(`You joined ${p.mapName}.`); navigate(`/collab/${mapId}`, { replace: true }); },
                })}>Accept invitation</Button>
              </div>
            </>
          ) : p.status === 'already_member' ? (
            <>
              <p className="mt-2 text-sm text-neutral-700">You’re already a member of <strong>{p.mapName}</strong>.</p>
              <div className="mt-5 flex justify-end"><Button variant="primary" onClick={() => navigate(`/collab/${p.mapId}`)}>Open map</Button></div>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-neutral-700" role="alert">{STATUS_TEXT[p.status]}</p>
              <div className="mt-5 flex justify-end"><Button onClick={() => navigate('/')}>Go to Discover</Button></div>
            </>
          )
        )}
      </section>
    </div>
  );
}
