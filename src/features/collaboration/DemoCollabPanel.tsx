/**
 * Right-panel content for guests and the tutorial sandbox. Explains that real
 * collaboration needs an account and offers the local demo map. In the demo,
 * roles, removal and shared copies can be explored; real invitations are never
 * created (the Invite button explains why an account is needed).
 */
import { useState } from 'react';
import { NavLink, useMatch } from 'react-router-dom';
import { Check, FlaskConical, MapPinned, RotateCcw, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { uiStore } from '@/app/store';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { useLocalSnapshot } from '@/features/workspace/useLocalSnapshot';
import { SignInPromptDialog } from '@/features/workspace/AccountRequired';
import { useMapInstance } from '@/features/map/MapContext';
import { Badge } from '@/components/ui/Feedback';
import { Button, IconButton } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/components/ui/cn';

type Role = 'owner' | 'editor' | 'viewer';
const CAPABILITIES: { label: string; roles: Role[] }[] = [
  { label: 'See pins shared into the map', roles: ['owner', 'editor', 'viewer'] },
  { label: 'Share copies of their own pins', roles: ['owner', 'editor'] },
  { label: 'Remove their own shared pins', roles: ['owner', 'editor'] },
  { label: 'Invite people, change roles, remove members', roles: ['owner'] },
  { label: 'Rename or delete the map; remove any shared pin', roles: ['owner'] },
];

export function DemoCollabPanel() {
  const ws = useWorkspace();
  const snap = useLocalSnapshot(ws.local);
  const onDemo = useMatch('/collab/demo');
  const toast = useToast();
  const { map } = useMapInstance();
  const [preview, setPreview] = useState<Role>('owner');
  const [prompt, setPrompt] = useState<null | 'invite' | 'collaboration'>(null);
  if (!snap || !ws.local) return null;
  const demo = snap.demo;
  const act = (fn: () => void, msg: string) => { try { fn(); toast.success(msg); } catch (e) { toast.error(e); } };

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-2 pt-4"><h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Collaboration</h2></div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        <p className="rounded-xl bg-neutral-100 p-3 text-xs text-neutral-700">
          Real collaboration maps are shared with people you invite, so they need an account.
          {' '}<button type="button" className="font-medium underline" onClick={() => setPrompt('collaboration')}>Why?</button>
          {' '}You can explore how they work in a local demo — nothing is sent.
        </p>
        <NavLink to="/collab/demo" data-tour="open-demo-collab"
          className={({ isActive }) => cn('flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm', isActive ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-100')}>
          <FlaskConical className="size-4 shrink-0 opacity-70" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{demo.mapName}</span>
          <span className="text-[11px] uppercase tracking-wide opacity-70">demo</span>
        </NavLink>

        {onDemo && (
          <section aria-label="Demo collaboration details" className="space-y-4 border-t border-neutral-200 pt-4">
            <div>
              <h3 className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Members <Badge tone="warning">Sample people</Badge>
              </h3>
              <ul className="space-y-1" data-tour="demo-members">
                {demo.members.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 text-sm">
                    <Users className="size-3.5 text-neutral-400" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{m.name}</span>
                    {m.isYou ? <Badge>{m.role}</Badge> : (
                      <>
                        <label className="sr-only" htmlFor={`demo-role-${m.id}`}>Role for {m.name}</label>
                        <select id={`demo-role-${m.id}`} value={m.role} className="h-7 rounded-md border border-neutral-300 bg-white px-1 text-xs"
                          onChange={(e) => act(() => ws.local!.setDemoRole(m.id, e.target.value as 'editor' | 'viewer'), 'Demo role changed.')}>
                          <option value="editor">Editor</option>
                          <option value="viewer">Viewer</option>
                        </select>
                        <IconButton label={`Remove ${m.name} (demo)`} size="sm" onClick={() => act(() => ws.local!.removeDemoMember(m.id), `${m.name} removed — in a real map they would lose access immediately.`)}>
                          <UserMinus className="size-3.5" aria-hidden />
                        </IconButton>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              <Button size="sm" className="mt-2" icon={<UserPlus className="size-3.5" aria-hidden />} onClick={() => setPrompt('invite')} data-tour="demo-invite">Invite people…</Button>
            </div>

            <fieldset data-tour="demo-roles">
              <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">What each role can do</legend>
              <div className="mb-2 flex gap-1" role="group" aria-label="Preview role">
                {(['owner', 'editor', 'viewer'] as Role[]).map((r) => (
                  <button key={r} type="button" aria-pressed={preview === r} onClick={() => setPreview(r)}
                    className={cn('h-7 rounded-md px-2.5 text-xs font-medium capitalize', preview === r ? 'bg-neutral-900 text-white' : 'bg-white ring-1 ring-neutral-300')}>{r}</button>
                ))}
              </div>
              <ul className="space-y-1 text-xs">
                {CAPABILITIES.map((c) => {
                  const ok = c.roles.includes(preview);
                  return (
                    <li key={c.label} className={cn('flex items-start gap-1.5', !ok && 'text-neutral-400')}>
                      {ok ? <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden /> : <X className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
                      <span>{ok ? 'Can' : 'Cannot'}: {c.label.toLowerCase()}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-[11px] text-neutral-500">Friendship alone never grants access to a map — only an accepted invitation does.</p>
            </fieldset>

            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Shared copies</h3>
              {demo.shares.length === 0 ? <p className="text-xs text-neutral-500">None yet. Open a pin on one of your maps and choose Share.</p> : (
                <ul className="space-y-0.5">
                  {demo.shares.map((s) => (
                    <li key={s.id}>
                      <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm hover:bg-neutral-100"
                        onClick={() => { uiStore.set({ selectedSharedPinId: s.id }); map?.easeTo({ center: [s.longitude, s.latitude] }); }}>
                        <MapPinned className="size-3.5 shrink-0 text-neutral-400" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{s.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" aria-hidden />} onClick={() => act(() => ws.local!.resetDemo(), 'Demo reset.')}>Reset demo</Button>
          </section>
        )}
      </div>
      <SignInPromptDialog open={!!prompt} onClose={() => setPrompt(null)} reason={prompt ?? 'collaboration'}
        extra={prompt === 'invite' ? <p className="mt-2 text-sm text-neutral-700">With an account, the owner creates a secure, expiring invitation link or QR code. The recipient must sign in and explicitly accept. No invitation is created in this demo.</p> : undefined} />
    </div>
  );
}
