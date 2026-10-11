/**
 * Map switcher ("My City ▾"): shows the map you are working in and lets you
 * jump to any personal or collaboration map, or create a new one. Lists only
 * maps the current workspace can read (RLS-filtered queries / local data).
 */
import { Link, useMatch } from 'react-router-dom';
import { Check, ChevronDown, FlaskConical, Map as MapIcon, Plus, Users } from 'lucide-react';
import { useAuth } from '../AuthProvider';
import { Popover } from '@/components/ui/Popover';
import { cn } from '@/components/ui/cn';
import { useMaps } from '@/features/maps/api';
import { useActiveMapId } from '@/features/maps/activeMap';
import { useCollabMaps } from '@/features/collaboration/api';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { useLocalSnapshot } from '@/features/workspace/useLocalSnapshot';

export function MapSwitcher() {
  const ws = useWorkspace();
  const { user } = useAuth();
  const maps = useMaps();
  const collab = useCollabMaps();
  const snap = useLocalSnapshot(ws.local);
  const activeId = useActiveMapId(ws.scope);
  const personal = useMatch('/maps/:mapId')?.params.mapId;
  const shared = useMatch('/collab/:mapId')?.params.mapId;
  const showRealCollab = !!user && !ws.local;
  const demoName = snap?.demo.mapName ?? 'Demo collaboration map';

  const current = personal ? maps.data?.find((m) => m.id === personal)?.name
    : shared === 'demo' ? demoName
      : shared ? collab.data?.find((m) => m.id === shared)?.name
        : maps.data?.find((m) => m.id === activeId)?.name ?? maps.data?.[0]?.name;
  const label = current ?? (ws.mode === 'sandbox' ? 'Practice maps' : 'My maps');

  const item = (active: boolean) => cn('flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm', active ? 'bg-brand-soft font-medium text-neutral-900' : 'text-neutral-700 hover:bg-neutral-100');

  return (
    <Popover align="left" label="Switch map" trigger={({ open, toggle, id }) => (
      <button type="button" aria-expanded={open} aria-controls={id} onClick={toggle} aria-label={`Current map: ${label}. Switch map`}
        className="flex h-9 max-w-[180px] items-center gap-1.5 rounded-lg px-2 text-[15px] font-medium text-neutral-800 hover:bg-neutral-100">
        <span className="truncate">{label}</span>
        <ChevronDown className="size-4 shrink-0 text-neutral-500" aria-hidden />
      </button>
    )}>
      {(close) => (
        <div className="w-72 p-1.5">
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{ws.mode === 'sandbox' ? 'Practice maps' : 'My maps'}</p>
          <ul>
            {maps.data?.map((m) => (
              <li key={m.id}>
                <Link to={`/maps/${m.id}`} onClick={close} className={item(m.id === personal)}>
                  <MapIcon className="size-4 shrink-0 opacity-70" aria-hidden /><span className="min-w-0 flex-1 truncate">{m.name}</span>
                  {m.id === personal && <Check className="size-4" aria-label="current" />}
                </Link>
              </li>
            ))}
            {maps.data?.length === 0 && <li className="px-3 py-1 text-xs text-neutral-500">No maps yet.</li>}
          </ul>
          <Link to="/maps?new=1" onClick={close} className={cn(item(false), 'text-brand')}><Plus className="size-4" aria-hidden />New map…</Link>
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Shared</p>
          <ul>
            {showRealCollab ? (
              collab.data?.length ? collab.data.map((m) => (
                <li key={m.id}>
                  <Link to={`/collab/${m.id}`} onClick={close} className={item(m.id === shared)}>
                    <Users className="size-4 shrink-0 opacity-70" aria-hidden /><span className="min-w-0 flex-1 truncate">{m.name}</span>
                    <span className="text-[11px] uppercase text-neutral-500">{m.myRole}</span>
                  </Link>
                </li>
              )) : <li className="px-3 py-1 text-xs text-neutral-500">No collaboration maps yet.</li>
            ) : (
              <li>
                <Link to="/collab/demo" onClick={close} className={item(shared === 'demo')}>
                  <FlaskConical className="size-4 shrink-0 opacity-70" aria-hidden /><span className="min-w-0 flex-1 truncate">{demoName}</span>
                </Link>
              </li>
            )}
          </ul>
        </div>
      )}
    </Popover>
  );
}
