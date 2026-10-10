/**
 * Right panel: collaboration maps, pending invitations, and — for the active
 * collaboration map — members, roles, invitations and shared pins.
 *
 * Controls are shown according to the caller's role for clarity, but every
 * action is re-authorized in the database (RLS / owner-only RPCs); hiding a
 * button is never the security boundary.
 */
import { lazy, Suspense, useState } from 'react';
import { NavLink, useMatch, useNavigate } from 'react-router-dom';
import { Check, LogOut, Mail, MapPinned, Plus, Trash2, UserMinus, UserPlus, Users } from 'lucide-react';
import { useAuth } from '@/app/AuthProvider';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { DemoCollabPanel } from './DemoCollabPanel';
import { uiStore } from '@/app/store';
import { useMapInstance } from '@/features/map/MapContext';
import type { CollabMap, CollabRole } from '@/lib/types';
import { Button, IconButton } from '@/components/ui/Button';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { TextArea, TextField } from '@/components/ui/Field';
import { Badge, EmptyState, ErrorMessage, Spinner } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/components/ui/cn';
import {
  invitationState, useCollabMaps, useCollabMembers, useCollabMutations, useInvitations, useMyPendingInvitations, useSharedPins,
} from './api';
// The invite dialog (and its QR library) loads on demand.
const InviteDialog = lazy(() => import('./InviteDialog').then((m) => ({ default: m.InviteDialog })));

export function CollabPanel() {
  const { user } = useAuth();
  const ws = useWorkspace();
  const maps = useCollabMaps();
  const invites = useMyPendingInvitations();
  const match = useMatch('/collab/:mapId');
  const [creating, setCreating] = useState(false);
  const active = maps.data?.find((m) => m.id === match?.params.mapId) ?? null;

  // Guests and the tutorial sandbox get the local, clearly-labelled demo.
  if (!user || ws.local) return <DemoCollabPanel />;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Collaboration</h2>
        <IconButton label="New collaboration map" size="sm" onClick={() => setCreating(true)}><Plus className="size-4" aria-hidden /></IconButton>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2 pb-4">
        {!!invites.data?.length && <PendingInvites />}

        {maps.isLoading ? <Spinner className="px-2" /> : maps.error ? <ErrorMessage error={maps.error} /> : maps.data?.length ? (
          <nav aria-label="Collaboration maps">
            <ul className="space-y-0.5">
              {maps.data.map((m) => (
                <li key={m.id}>
                  <NavLink
                    to={`/collab/${m.id}`}
                    className={({ isActive }) => cn('flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm',
                      isActive ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-100')}
                  >
                    <Users className="size-4 shrink-0 opacity-70" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{m.name}</span>
                    <span className="text-[11px] uppercase tracking-wide opacity-70">{m.myRole}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        ) : (
          <EmptyState title="No collaboration maps yet">Create one, then invite people and share selected pins into it.</EmptyState>
        )}

        {active && <ActiveCollab key={active.id} map={active} />}
      </div>

      {creating && <CreateCollabDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function PendingInvites() {
  const toast = useToast();
  const invites = useMyPendingInvitations();
  const { respondInvite } = useCollabMutations();
  const navigate = useNavigate();
  return (
    <section aria-label="Pending invitations" className="rounded-xl bg-accent-soft/60 p-2">
      <h3 className="flex items-center gap-1.5 px-1 pb-1 text-xs font-semibold text-accent-strong"><Mail className="size-3.5" aria-hidden />Invitations</h3>
      <ul className="space-y-1.5">
        {invites.data!.map((i) => (
          <li key={i.invitationId} className="rounded-lg bg-white p-2 text-sm shadow-sm">
            <p><span className="font-medium">{i.inviterName}</span> invited you to <span className="font-medium">{i.mapName}</span> as {i.role}.</p>
            <div className="mt-1.5 flex gap-1.5">
              <Button size="sm" variant="primary" disabled={respondInvite.isPending} loading={respondInvite.isPending && respondInvite.variables?.invitationId === i.invitationId && respondInvite.variables.accept}
                onClick={() => respondInvite.mutate({ invitationId: i.invitationId, accept: true }, {
                  onSuccess: (mapId) => { toast.success(`Joined ${i.mapName}.`); if (mapId) navigate(`/collab/${mapId}`); },
                  onError: (e) => toast.error(e),
                })}>Accept</Button>
              <Button size="sm" variant="ghost" disabled={respondInvite.isPending}
                onClick={() => respondInvite.mutate({ invitationId: i.invitationId, accept: false }, {
                  onSuccess: () => toast.info('Invitation declined.'), onError: (e) => toast.error(e),
                })}>Decline</Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ActiveCollab({ map }: { map: CollabMap }) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { map: mapInstance } = useMapInstance();
  const isOwner = map.myRole === 'owner';
  const members = useCollabMembers(map.id);
  const shared = useSharedPins(map.id);
  const invitations = useInvitations(map.id, isOwner);
  const m = useCollabMutations();
  const [dialog, setDialog] = useState<'invite' | 'rename' | 'delete' | 'leave' | null>(null);
  const [removing, setRemoving] = useState<{ userId: string; name: string } | null>(null);
  const activeInvites = (invitations.data ?? []).filter((i) => invitationState(i) === 'active');

  return (
    <section aria-label={`${map.name} details`} className="space-y-4 border-t border-neutral-200 px-2 pt-4">
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold">{map.name}</h3>
          <Badge tone="accent">{map.myRole}</Badge>
        </div>
        {map.description && <p className="mt-1 text-xs text-neutral-500">{map.description}</p>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {isOwner && <Button size="sm" variant="primary" icon={<UserPlus className="size-3.5" aria-hidden />} onClick={() => setDialog('invite')}>Invite</Button>}
          {isOwner && <Button size="sm" onClick={() => setDialog('rename')}>Rename</Button>}
          {isOwner
            ? <Button size="sm" variant="ghost" className="text-danger" icon={<Trash2 className="size-3.5" aria-hidden />} onClick={() => setDialog('delete')}>Delete</Button>
            : <Button size="sm" variant="ghost" icon={<LogOut className="size-3.5" aria-hidden />} onClick={() => setDialog('leave')}>Leave</Button>}
        </div>
      </div>

      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Members</h4>
        {members.isLoading ? <Spinner /> : members.error ? <ErrorMessage error={members.error} /> : (
          <ul className="space-y-1">
            {members.data?.map((mem) => (
              <li key={mem.userId} className="flex items-center gap-2 text-sm">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-neutral-200 text-[11px] font-semibold uppercase" aria-hidden>{(mem.displayName || mem.username)[0]}</span>
                <span className="min-w-0 flex-1 truncate">{mem.displayName || mem.username}{mem.userId === user?.id && ' (you)'}</span>
                {isOwner && mem.role !== 'owner' ? (
                  <>
                    <label className="sr-only" htmlFor={`role-${mem.userId}`}>Role for {mem.username}</label>
                    <select id={`role-${mem.userId}`} value={mem.role} disabled={m.setRole.isPending}
                      onChange={(e) => m.setRole.mutate({ mapId: map.id, userId: mem.userId, role: e.target.value as Exclude<CollabRole, 'owner'> }, {
                        onSuccess: () => toast.success('Role updated.'), onError: (err) => toast.error(err),
                      })}
                      className="h-7 rounded-md border border-neutral-300 bg-white px-1 text-xs">
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <IconButton label={`Remove ${mem.username}`} size="sm" onClick={() => setRemoving({ userId: mem.userId, name: mem.displayName || mem.username })}>
                      <UserMinus className="size-3.5" aria-hidden />
                    </IconButton>
                  </>
                ) : <Badge>{mem.role}</Badge>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {isOwner && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Active invitation links</h4>
          {invitations.isLoading ? <Spinner /> : activeInvites.length === 0 ? <p className="text-xs text-neutral-500">None</p> : (
            <ul className="space-y-1">
              {activeInvites.map((i) => (
                <li key={i.id} className="flex items-center gap-2 text-xs text-neutral-600">
                  <span className="min-w-0 flex-1">
                    {i.role} · {i.recipientId ? 'specific friend' : 'anyone with link'} · {i.useCount}{i.maxUses ? `/${i.maxUses}` : ''} used · expires {new Date(i.expiresAt).toLocaleDateString()}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => m.revokeInvitation.mutate({ id: i.id, mapId: map.id }, {
                    onSuccess: () => toast.success('Invitation revoked.'), onError: (e) => toast.error(e),
                  })}>Revoke</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Shared pins</h4>
        {shared.isLoading ? <Spinner /> : shared.data?.length ? (
          <ul className="space-y-0.5">
            {shared.data.map((p) => (
              <li key={p.id}>
                <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm hover:bg-neutral-100"
                  onClick={() => {
                    uiStore.set({ selectedSharedPinId: p.id });
                    mapInstance?.easeTo({ center: [p.longitude, p.latitude], zoom: Math.max(mapInstance.getZoom(), 13) });
                  }}>
                  <MapPinned className="size-3.5 shrink-0 text-neutral-400" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{p.title}</span>
                  <span className="truncate text-[11px] text-neutral-500">{p.sharedBy === user?.id ? 'you' : p.sharedByName}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-neutral-500">
            {map.myRole === 'viewer' ? 'Nothing shared yet.' : 'Nothing shared yet. Open one of your pins and choose Share.'}
          </p>
        )}
      </div>

      {dialog === 'invite' && <Suspense fallback={null}><InviteDialog mapId={map.id} mapName={map.name} onClose={() => setDialog(null)} /></Suspense>}
      {dialog === 'rename' && <RenameCollabDialog map={map} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={dialog === 'delete'} danger busy={m.remove.isPending}
        title="Delete collaboration map?" confirmLabel="Delete map"
        message="All members lose access and every shared copy in this map is removed. Members’ private original pins are not affected."
        onClose={() => setDialog(null)}
        onConfirm={() => m.remove.mutate(map.id, {
          onSuccess: () => { toast.success('Collaboration map deleted.'); setDialog(null); navigate('/'); },
          onError: (e) => toast.error(e),
        })}
      />
      <ConfirmDialog
        open={dialog === 'leave'} busy={m.leave.isPending}
        title="Leave collaboration map?" confirmLabel="Leave"
        message="You’ll lose access immediately. Pins you shared stay in the map until you or the owner remove them (remove them first if you want them gone)."
        onClose={() => setDialog(null)}
        onConfirm={() => m.leave.mutate({ mapId: map.id, userId: user!.id }, {
          onSuccess: () => { toast.success(`You left ${map.name}.`); setDialog(null); navigate('/'); },
          onError: (e) => toast.error(e),
        })}
      />
      <ConfirmDialog
        open={!!removing} danger busy={m.removeMember.isPending}
        title="Remove member?" confirmLabel="Remove"
        message={`${removing?.name} will lose access to this map immediately.`}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && m.removeMember.mutate({ mapId: map.id, userId: removing.userId }, {
          onSuccess: () => { toast.success('Member removed.'); setRemoving(null); },
          onError: (e) => toast.error(e),
        })}
      />
    </section>
  );
}

function CreateCollabDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { create } = useCollabMutations();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [touched, setTouched] = useState(false);
  const submit = () => {
    setTouched(true);
    if (!name.trim()) return;
    create.mutate({ name: name.trim(), description }, {
      onSuccess: (id) => { toast.success('Collaboration map created.'); onClose(); navigate(`/collab/${id}`); },
    });
  };
  return (
    <Dialog open onClose={onClose} title="New collaboration map" dismissible={!create.isPending}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={create.isPending} onClick={submit}>Create</Button></>}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <TextField label="Name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} error={touched && !name.trim() ? 'Enter a name.' : null} />
        <TextArea label="Description (optional)" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
        <p className="text-xs text-neutral-500">Only people you invite can see this map. You’ll be its owner.</p>
        <ErrorMessage error={create.error} />
      </form>
    </Dialog>
  );
}

function RenameCollabDialog({ map, onClose }: { map: CollabMap; onClose: () => void }) {
  const toast = useToast();
  const { rename } = useCollabMutations();
  const [name, setName] = useState(map.name);
  const [description, setDescription] = useState(map.description ?? '');
  return (
    <Dialog open onClose={onClose} title="Rename collaboration map" dismissible={!rename.isPending}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={rename.isPending} disabled={!name.trim()}
          onClick={() => rename.mutate({ id: map.id, name, description }, { onSuccess: () => { toast.success('Saved.'); onClose(); } })}>
          <Check className="size-4" aria-hidden />Save
        </Button></>}>
      <div className="space-y-3">
        <TextField label="Name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        <TextArea label="Description" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
        <ErrorMessage error={rename.error} />
      </div>
    </Dialog>
  );
}
