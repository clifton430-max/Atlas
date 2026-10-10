/**
 * Owner-only invitation creation. The server (create_collab_invitation)
 * re-verifies ownership, limits roles to editor/viewer, restricts direct
 * invitations to friends, and returns the raw token ONCE (only its hash is
 * stored). The resulting link/QR leads to /invite/:token, which requires
 * explicit acceptance.
 */
import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { SelectField } from '@/components/ui/Field';
import { ErrorMessage, Notice } from '@/components/ui/Feedback';
import { useFriendships } from '@/features/friends/api';
import { inviteUrl, useCollabMutations } from './api';
import { ShareLink } from './ShareLink';

export function InviteDialog({ mapId, mapName, onClose }: { mapId: string; mapName: string; onClose: () => void }) {
  const { createInvitation } = useCollabMutations();
  const friends = useFriendships();
  const [role, setRole] = useState<'viewer' | 'editor'>('viewer');
  const [expires, setExpires] = useState(168);
  const [maxUses, setMaxUses] = useState<string>('');
  const [recipient, setRecipient] = useState<string>('');
  const [result, setResult] = useState<{ token: string; expiresAt: string } | null>(null);

  const accepted = (friends.data ?? []).filter((f) => f.status === 'accepted' && f.other);

  const create = async () => {
    try {
      const r = await createInvitation.mutateAsync({
        mapId, role, recipientId: recipient || null, expiresInHours: expires,
        maxUses: recipient ? 1 : maxUses ? Number(maxUses) : null,
      });
      setResult(r);
    } catch {
      /* shown below */
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={result ? 'Invitation ready' : `Invite to “${mapName}”`}
      dismissible={!createInvitation.isPending}
      footer={result ? <Button variant="primary" onClick={onClose}>Done</Button> : (
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={create} loading={createInvitation.isPending}>Create invitation</Button>
        </>
      )}
    >
      {result ? (
        <div className="space-y-3">
          <ShareLink url={inviteUrl(result.token)} title={`Join “${mapName}” on Atlas`} text={`You're invited to collaborate on “${mapName}” in Atlas.`} />
          <Notice>
            This link is shown only once. It expires {new Date(result.expiresAt).toLocaleString()} and can be revoked any time from the members panel.
            Recipients must sign in and explicitly accept.
          </Notice>
        </div>
      ) : (
        <div className="space-y-4">
          <SelectField label="Role" value={role} onChange={(e) => setRole(e.target.value as 'viewer' | 'editor')}
            hint={role === 'editor' ? 'Editors can view and share their own pins into this map.' : 'Viewers can only view shared pins.'}>
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
          </SelectField>
          <SelectField label="Only this friend can accept (optional)" value={recipient} onChange={(e) => setRecipient(e.target.value)}
            hint={recipient ? 'They’ll also see it in their invitations list. Single use.' : 'Anyone with the link can accept (subject to the limits below).'}>
            <option value="">Anyone with the link</option>
            {accepted.map((f) => <option key={f.id} value={f.other!.id}>{f.other!.displayName || f.other!.username} (@{f.other!.username})</option>)}
          </SelectField>
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Expires after" value={String(expires)} onChange={(e) => setExpires(Number(e.target.value))}>
              <option value="1">1 hour</option>
              <option value="24">1 day</option>
              <option value="168">7 days</option>
              <option value="720">30 days</option>
            </SelectField>
            <SelectField label="Maximum uses" value={recipient ? '1' : maxUses} disabled={!!recipient} onChange={(e) => setMaxUses(e.target.value)}>
              <option value="">Unlimited</option>
              <option value="1">1</option>
              <option value="5">5</option>
              <option value="25">25</option>
            </SelectField>
          </div>
          <ErrorMessage error={createInvitation.error} />
        </div>
      )}
    </Dialog>
  );
}
