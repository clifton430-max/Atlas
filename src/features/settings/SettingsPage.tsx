/**
 * Settings (/settings/:section): account, privacy, friends, map appearance,
 * groups, pins and collaboration permissions. Rendered as a sheet over the
 * app; the map stays mounted underneath so the viewport is preserved.
 */
import { useEffect, useMemo, useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CloudSun, Eye, HardDrive, Map as MapIcon, Palette, Shield, Tags, UserRound, Users, X, MapPinned } from 'lucide-react';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { GuestDataSection } from '@/features/workspace/GuestDataSection';
import { useLocalSnapshot } from '@/features/workspace/useLocalSnapshot';
import { AnimationsSettings } from './AnimationsSettings';
import { AccountRequiredCard, type AccountReason } from '@/features/workspace/AccountRequired';
import { useAuth } from '@/app/AuthProvider';
import { uiStore } from '@/app/store';
import { requireSupabase } from '@/lib/supabase';
import { USERNAME } from '@/lib/validation';
import { MAP_STYLES, isMapStyleCustomizable } from '@/lib/env';
import type { Group } from '@/lib/types';
import { Button, IconButton } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Switch, TextField } from '@/components/ui/Field';
import { Badge, EmptyState, ErrorMessage, Notice, Spinner } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/components/ui/cn';
import { useProfile, useUpdateProfile } from './profileApi';
import { friendlyAuthError } from '@/features/auth/authErrors';
import { FriendsSection } from '@/features/friends/FriendsSection';
import { useGroupMutations, useGroups } from '@/features/groups/api';
import { GroupFormDialog } from '@/features/groups/GroupFormDialog';
import { pinTitle, useAllPins, usePinMutations } from '@/features/pins/api';
import { useMaps } from '@/features/maps/api';
import { useCollabMaps, useCollabMutations } from '@/features/collaboration/api';
import { getMyFriendCode, friendLinkUrl, useFriendMutations } from '@/features/friends/api';
import { ShareLink } from '@/features/collaboration/ShareLink';
import { listMyOrphanedImages, removeOrphanedImages } from '@/features/pins/images';

const SECTIONS = [
  { id: 'account', label: 'Account', Icon: UserRound },
  { id: 'privacy', label: 'Privacy', Icon: Shield },
  { id: 'friends', label: 'Friends', Icon: Users },
  { id: 'appearance', label: 'Map appearance', Icon: Palette },
  { id: 'animations', label: 'Map animations & weather', Icon: CloudSun },
  { id: 'groups', label: 'Groups', Icon: Tags },
  { id: 'pins', label: 'Pins', Icon: MapPinned },
  { id: 'collaboration', label: 'Collaboration', Icon: Eye },
  { id: 'guest', label: 'Guest data', Icon: HardDrive },
] as const;

/** Sections that belong to a signed-in account (guests see an explanation). */
const ACCOUNT_ONLY: Record<string, AccountReason> = { account: 'profile', privacy: 'profile', friends: 'friends', collaboration: 'collaboration' };

export function SettingsPage() {
  const { user } = useAuth();
  const ws = useWorkspace();
  const { section: param } = useParams();
  const section = param ?? (user ? 'account' : 'guest');
  const navigate = useNavigate();
  // Go back if Settings was opened from within the app; otherwise (direct link) go home.
  const close = () => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate('/'));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('dialog[open]') && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="absolute inset-0 z-40 flex justify-center bg-neutral-900/25 p-2 backdrop-blur-[1px] sm:p-6">
      <section aria-labelledby="settings-title" className="flex h-full w-full max-w-[920px] flex-col overflow-hidden rounded-2xl bg-white shadow-float animate-rise-in md:flex-row">
        <nav aria-label="Settings sections" data-tour="settings-nav" className="shrink-0 border-b border-neutral-200 bg-neutral-50 p-3 md:w-56 md:border-b-0 md:border-r">
          <h1 id="settings-title" className="px-2 pb-3 pt-1 text-base font-semibold">Settings</h1>
          <ul className="atlas-scroll flex gap-1 overflow-x-auto pb-1 md:block md:space-y-0.5 md:overflow-visible md:pb-0">
            {SECTIONS.map(({ id, label, Icon }) => (
              <li key={id}>
                <NavLink to={`/settings/${id}`} replace className={({ isActive }) => cn('flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-2 py-1.5 text-sm', isActive ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-200/60')}>
                  <Icon className="size-4" aria-hidden />{label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="relative min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <IconButton label="Close settings" className="absolute right-4 top-4" onClick={close}><X className="size-4" aria-hidden /></IconButton>
          {!user && ACCOUNT_ONLY[section] ? (
            <div className="max-w-md pt-6"><AccountRequiredCard reason={ACCOUNT_ONLY[section]} /></div>
          ) : (
            <>
              {section === 'account' && <AccountSection />}
              {section === 'privacy' && <PrivacySection />}
              {section === 'friends' && <FriendsSection />}
              {section === 'collaboration' && <CollaborationSettings />}
            </>
          )}
          {section === 'guest' && <GuestDataSection />}
          {ws.mode === 'sandbox' && ['groups', 'pins', 'appearance'].includes(section) && (
            <Notice className="mb-4">Tutorial sandbox: changes here affect practice data only.</Notice>
          )}
          {section === 'appearance' && <AppearanceSection />}
          {section === 'animations' && <AnimationsSettings />}
          {section === 'groups' && <GroupsSettings />}
          {section === 'pins' && <PinsSettings />}
          {!SECTIONS.some((s) => s.id === section) && <ErrorMessage error="Unknown settings section." />}
        </div>
      </section>
    </div>
  );
}

function H2({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <header className="mb-5 pr-10">
      <h2 className="text-lg font-semibold">{children}</h2>
      {sub && <p className="mt-0.5 text-sm text-neutral-500">{sub}</p>}
    </header>
  );
}

function AccountSection() {
  const { user } = useAuth();
  const toast = useToast();
  const profile = useProfile();
  const update = useUpdateProfile();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  useEffect(() => {
    if (profile.data) {
      setUsername(profile.data.username);
      setDisplayName(profile.data.displayName);
    }
  }, [profile.data]);

  if (profile.isLoading) return <Spinner />;
  if (profile.error) return <ErrorMessage error={profile.error} />;
  const usernameError = username && !USERNAME.test(username) ? 'Use 3–30 lowercase letters, numbers or _.' : null;

  return (
    <div className="max-w-md space-y-8">
      <div>
        <H2 sub={user?.email}>Account</H2>
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          if (usernameError) return;
          update.mutate({ username, displayName: displayName.trim() }, { onSuccess: () => toast.success('Profile saved.') });
        }}>
          <TextField label="Username" value={username} maxLength={30} onChange={(e) => setUsername(e.target.value.toLowerCase())} error={usernameError} />
          <TextField label="Display name" value={displayName} maxLength={80} onChange={(e) => setDisplayName(e.target.value)} />
          <ErrorMessage error={update.error} />
          <Button type="submit" variant="primary" loading={update.isPending}>Save profile</Button>
        </form>
      </div>
      <div>
        <h3 className="mb-3 text-sm font-semibold">Change password</h3>
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          if (password.length < 8) return setPwError('Use at least 8 characters.');
          setPwBusy(true);
          setPwError(null);
          const { error } = await requireSupabase().auth.updateUser({ password });
          setPwBusy(false);
          if (error) setPwError(friendlyAuthError(error.message));
          else { setPassword(''); toast.success('Password updated.'); }
        }}>
          <TextField label="New password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={pwError} />
          <Button type="submit" loading={pwBusy}>Update password</Button>
        </form>
      </div>
    </div>
  );
}

function PrivacySection() {
  const toast = useToast();
  const profile = useProfile();
  const update = useUpdateProfile();
  const { regenerateCode } = useFriendMutations();
  const code = useQuery({ queryKey: ['myFriendCode'], queryFn: getMyFriendCode });
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="max-w-xl space-y-8">
      <H2 sub="What other people can see and do.">Privacy</H2>
      <Notice>
        Personal maps, pins, notes and groups are always private to you. Discover only shows public events.
        Being friends never grants access to your maps. A pin becomes visible to others only when you explicitly share a copy into a collaboration map.
      </Notice>
      {profile.data && (
        <Switch
          label="Let people find me by username"
          description="When off, only friends, pending requests and collaborators can see your profile. Your friend link still works."
          checked={profile.data.discoverable}
          disabled={update.isPending}
          onChange={(v) => update.mutate({ discoverable: v }, { onSuccess: () => toast.success('Privacy setting saved.'), onError: (e) => toast.error(e) })}
        />
      )}
      <div>
        <h3 className="mb-1 text-sm font-semibold">Your friend link</h3>
        <p className="mb-3 text-xs text-neutral-500">Anyone with this link can send you a friend request. Reset it to invalidate links you’ve shared.</p>
        {code.isLoading ? <Spinner /> : code.error ? <ErrorMessage error={code.error} /> : code.data && (
          <ShareLink url={friendLinkUrl(code.data)} title="Add me on Atlas" text="Add me as a friend on Atlas" />
        )}
        <Button size="sm" variant="ghost" className="mt-3" onClick={() => setConfirmReset(true)}>Reset friend link</Button>
      </div>
      <ConfirmDialog
        open={confirmReset} busy={regenerateCode.isPending}
        title="Reset friend link?" confirmLabel="Reset link"
        message="Your current friend link and QR code will stop working."
        onClose={() => setConfirmReset(false)}
        onConfirm={() => regenerateCode.mutate(undefined, {
          onSuccess: () => { code.refetch(); setConfirmReset(false); toast.success('Friend link reset.'); },
          onError: (e) => toast.error(e),
        })}
      />
    </div>
  );
}

function AppearanceSection() {
  const toast = useToast();
  const ws = useWorkspace();
  const local = useLocalSnapshot(ws.local);
  const profile = useProfile();
  const update = useUpdateProfile();
  // Local workspaces keep their own preference; accounts store it in the profile.
  const current = ws.local ? local?.prefs.mapStyle : profile.data?.mapStyle;
  const choose = (id: 'positron' | 'bright' | 'liberty') => {
    if (ws.local) {
      try { ws.local.setMapStyle(id); toast.success('Map style saved on this device.'); } catch (e) { toast.error(e); }
    } else update.mutate({ mapStyle: id }, { onSuccess: () => toast.success('Map style saved.'), onError: (e) => toast.error(e) });
  };
  return (
    <div className="max-w-xl space-y-8">
      <div>
      <H2 sub="Choose the basemap style.">Map appearance</H2>
      {!isMapStyleCustomizable ? (
        <Notice>This deployment uses a custom map style (VITE_MAP_STYLE_URL), so the style can’t be changed here.</Notice>
      ) : current && (
        <fieldset className="space-y-2">
          <legend className="sr-only">Map style</legend>
          {MAP_STYLES.map((s) => (
            <label key={s.id} className={cn('flex cursor-pointer items-center gap-3 rounded-xl p-3 ring-1', current === s.id ? 'ring-2 ring-neutral-900' : 'ring-neutral-200 hover:bg-neutral-50')}>
              <input type="radio" name="map-style" value={s.id} checked={current === s.id}
                onChange={() => choose(s.id)}
                className="accent-neutral-900" />
              <MapIcon className="size-4 text-neutral-500" aria-hidden />
              <span className="text-sm">{s.label}</span>
            </label>
          ))}
          <p className="pt-1 text-xs text-neutral-500">Basemaps by OpenFreeMap © OpenMapTiles, data © OpenStreetMap contributors.</p>
        </fieldset>
      )}
      </div>
      <p className="text-sm text-neutral-600">Moving cars, people, trains, aircraft and weather effects are in <NavLink to="/settings/animations" replace className="font-medium underline">Map animations &amp; weather</NavLink>.</p>
    </div>
  );
}

function GroupsSettings() {
  const toast = useToast();
  const groups = useGroups();
  const pins = useAllPins();
  const { remove } = useGroupMutations();
  const [editing, setEditing] = useState<Group | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Group | null>(null);
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const p of pins.data ?? []) for (const g of p.groupIds) c.set(g, (c.get(g) ?? 0) + 1);
    return c;
  }, [pins.data]);

  return (
    <div className="max-w-xl">
      <H2 sub="Groups are shared across all your maps. Deleting a group never deletes pins.">Groups</H2>
      <Button size="sm" variant="primary" className="mb-4" onClick={() => setEditing('new')}>New group</Button>
      {groups.isLoading ? <Spinner /> : groups.error ? <ErrorMessage error={groups.error} /> : !groups.data?.length ? <EmptyState title="No groups yet" /> : (
        <ul className="divide-y divide-neutral-100 rounded-xl ring-1 ring-neutral-200">
          {groups.data.map((g) => (
            <li key={g.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="size-3 rounded-full ring-1 ring-black/10" style={{ background: g.color }} aria-hidden />
              <span className="flex-1">{g.name}</span>
              <span className="text-xs text-neutral-500">{counts.get(g.id) ?? 0} pins</span>
              <Button size="sm" variant="ghost" onClick={() => setEditing(g)}>Edit</Button>
              <Button size="sm" variant="ghost" className="text-danger" onClick={() => setDeleting(g)}>Delete</Button>
            </li>
          ))}
        </ul>
      )}
      {editing && <GroupFormDialog group={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={!!deleting} danger busy={remove.isPending} title={`Delete “${deleting?.name}”?`} confirmLabel="Delete group"
        message="Pins are kept; they just stop belonging to this group."
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => { setDeleting(null); toast.success('Group deleted.'); }, onError: (e) => toast.error(e) })} />
    </div>
  );
}

function PinsSettings() {
  const toast = useToast();
  const ws = useWorkspace();
  const navigate = useNavigate();
  const pins = useAllPins();
  const maps = useMaps();
  const groups = useGroups();
  const { remove } = usePinMutations();
  const [confirm, setConfirm] = useState<string | null>(null);
  const mapName = (id: string) => maps.data?.find((m) => m.id === id)?.name ?? '—';
  const target = pins.data?.find((p) => p.id === confirm);

  return (
    <div>
      <H2 sub="Every pin across your private maps.">Pins</H2>
      {pins.isLoading ? <Spinner /> : pins.error ? <ErrorMessage error={pins.error} /> : !pins.data?.length ? <EmptyState title="No pins yet">Save an event from Discover or add a custom pin to a map.</EmptyState> : (
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-neutral-500">
            <tr><th className="py-2 font-medium">Pin</th><th className="font-medium">Map</th><th className="font-medium">Groups</th><th className="sr-only">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {pins.data.map((p) => (
              <tr key={p.id}>
                <td className="max-w-[240px] truncate py-2 pr-2">
                  {pinTitle(p)} {p.kind === 'event' && <Badge>event</Badge>} {p.appearance.imageId && <Badge>image</Badge>}
                </td>
                <td className="pr-2 text-neutral-600">{mapName(p.mapId)}</td>
                <td className="pr-2">
                  <span className="flex flex-wrap gap-1">
                    {p.groupIds.map((gid) => {
                      const g = groups.data?.find((x) => x.id === gid);
                      return g ? <span key={gid} className="flex items-center gap-1 text-xs"><span className="size-2 rounded-full" style={{ background: g.color }} aria-hidden />{g.name}</span> : null;
                    })}
                  </span>
                </td>
                <td className="whitespace-nowrap text-right">
                  <Button size="sm" variant="ghost" onClick={() => { uiStore.set({ selectedPinId: p.id }); navigate(`/maps/${p.mapId}`); }}>Open</Button>
                  <Button size="sm" variant="ghost" className="text-danger" onClick={() => setConfirm(p.id)}>Delete</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!ws.local && <UnusedUploads />}
      <ConfirmDialog open={!!target} danger busy={remove.isPending} title="Delete pin?" confirmLabel="Delete pin"
        message={target ? `“${pinTitle(target)}” will be deleted from ${mapName(target.mapId)}. Shared copies remain until unshared.` : ''}
        onClose={() => setConfirm(null)}
        onConfirm={() => target && remove.mutate(target, { onSuccess: () => { setConfirm(null); toast.success('Pin deleted.'); }, onError: (e) => toast.error(e) })} />
    </div>
  );
}

function CollaborationSettings() {
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const maps = useCollabMaps();
  const { leave } = useCollabMutations();
  return (
    <div className="max-w-xl">
      <H2 sub="Your roles in collaboration maps. Owners manage members and invitations from the collaboration panel.">Collaboration</H2>
      <dl className="mb-5 grid grid-cols-[80px_1fr] gap-x-3 gap-y-1 text-xs text-neutral-600">
        <dt className="font-semibold">Owner</dt><dd>Invite, change roles, remove members, rename/delete the map, remove any shared pin.</dd>
        <dt className="font-semibold">Editor</dt><dd>View, share own pins in, and remove own shared pins.</dd>
        <dt className="font-semibold">Viewer</dt><dd>View shared pins only.</dd>
      </dl>
      {maps.isLoading ? <Spinner /> : maps.error ? <ErrorMessage error={maps.error} /> : !maps.data?.length ? <EmptyState title="You’re not in any collaboration maps" /> : (
        <ul className="divide-y divide-neutral-100 rounded-xl ring-1 ring-neutral-200">
          {maps.data.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="flex-1">{m.name}</span>
              <Badge tone={m.myRole === 'owner' ? 'accent' : 'neutral'}>{m.myRole}</Badge>
              <Button size="sm" variant="ghost" onClick={() => navigate(`/collab/${m.id}`)}>Open</Button>
              {m.myRole !== 'owner' && (
                <Button size="sm" variant="ghost" loading={leave.isPending && leave.variables?.mapId === m.id}
                  onClick={() => leave.mutate({ mapId: m.id, userId: user!.id }, { onSuccess: () => toast.success(`Left ${m.name}.`), onError: (e) => toast.error(e) })}>
                  Leave
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Owner-triggered cleanup of unreferenced uploads (never automatic). */
function UnusedUploads() {
  const toast = useToast();
  const orphans = useQuery({ queryKey: ['orphanedImages'], queryFn: listMyOrphanedImages });
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const total = (orphans.data ?? []).reduce((n, o) => n + o.sizeBytes, 0);
  return (
    <section aria-labelledby="unused-uploads" className="mt-8 border-t border-neutral-100 pt-5">
      <h3 id="unused-uploads" className="text-sm font-semibold">Unused uploads</h3>
      <p className="mb-2 text-xs text-neutral-500">Image files you uploaded that no pin or shared pin uses (for example after an interrupted upload). Files used anywhere are never listed.</p>
      {orphans.isLoading ? <Spinner /> : orphans.error ? <ErrorMessage error={orphans.error} /> : orphans.data!.length === 0 ? (
        <p className="text-sm text-neutral-500">No unused uploads.</p>
      ) : (
        <div className="flex items-center gap-3 text-sm">
          <span>{orphans.data!.length} file{orphans.data!.length > 1 ? 's' : ''} · {(total / 1024).toFixed(1)} KB</span>
          <Button size="sm" onClick={() => setConfirm(true)}>Remove unused uploads</Button>
        </div>
      )}
      <ConfirmDialog open={confirm} busy={busy} title="Remove unused uploads?" confirmLabel="Remove files"
        message="These files aren’t used by any pin. They will be permanently deleted."
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          setBusy(true);
          try {
            const n = await removeOrphanedImages(orphans.data!.map((o) => o.name));
            toast.success(`Removed ${n} unused file${n === 1 ? '' : 's'}.`);
            setConfirm(false);
            await orphans.refetch();
          } catch (e) {
            toast.error(e);
          } finally {
            setBusy(false);
          }
        }} />
    </section>
  );
}
