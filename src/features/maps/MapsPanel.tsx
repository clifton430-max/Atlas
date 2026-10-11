/**
 * "My Maps" side panel: the user's private maps (CRUD) and, for the open map,
 * custom pins and groups. Discover has its own panel (DiscoverPanel).
 */
import { useEffect, useState } from 'react';
import { NavLink, useMatch, useNavigate, useSearchParams } from 'react-router-dom';
import { HardDrive, Lock, Map as MapIcon, MapPinPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { uiStore, useUi } from '@/app/store';
import type { PersonalMap } from '@/lib/types';
import { Button, IconButton } from '@/components/ui/Button';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { TextArea, TextField } from '@/components/ui/Field';
import { ErrorMessage, Spinner } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/components/ui/cn';
import { GroupsSection } from '@/features/groups/GroupsSection';
import { GroupFilterControl } from '@/features/map/FilterControl';
import { useMapMutations, useMaps } from './api';
import { setActiveMapId } from './activeMap';

const navCls = ({ isActive }: { isActive: boolean }) =>
  cn('flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm', isActive ? 'bg-lime-soft font-medium text-neutral-900 ring-1 ring-lime-strong/60' : 'text-neutral-700 hover:bg-neutral-100');

export function MapsPanel() {
  const ws = useWorkspace();
  const maps = useMaps();
  const personal = useMatch('/maps/:mapId');
  const placing = useUi((s) => s.placingPin);
  const [dialog, setDialog] = useState<{ kind: 'edit'; map?: PersonalMap } | { kind: 'delete'; map: PersonalMap } | null>(null);
  const [params, setParams] = useSearchParams();
  const openMapId = personal?.params.mapId;

  // "New map…" from the map switcher arrives as ?new=1.
  useEffect(() => {
    if (params.get('new') !== '1') return;
    setDialog({ kind: 'edit' });
    setParams((p) => { p.delete('new'); return p; }, { replace: true });
  }, [params, setParams]);
  // Remember the open map so "My Maps" returns to it.
  useEffect(() => {
    if (openMapId && maps.data?.some((m) => m.id === openMapId)) setActiveMapId(ws.scope, openMapId);
  }, [openMapId, maps.data, ws.scope]);

  return (
    <div className="flex h-full flex-col">
      <nav aria-label="Maps" className="space-y-4 px-3">
        <section aria-labelledby="my-maps-heading" data-tour="my-maps">
          <div className="flex items-center justify-between px-2 pb-1">
            <h2 id="my-maps-heading" className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {ws.mode === 'sandbox' ? 'Practice maps' : 'My maps'}
              {ws.isLocal
                ? <HardDrive className="size-3" aria-label="stored on this device" />
                : <Lock className="size-3" aria-label="private to your account" />}
            </h2>
            <IconButton label="New map" size="sm" data-tour="new-map" onClick={() => setDialog({ kind: 'edit' })}><Plus className="size-4" aria-hidden /></IconButton>
          </div>
          {maps.isLoading ? <Spinner className="px-2" /> : maps.error ? <ErrorMessage error={maps.error} /> : maps.data?.length === 0 ? (
            <p className="px-2 text-xs text-neutral-500">No maps yet. Use + to create one.</p>
          ) : (
            <ul className="space-y-0.5">
              {maps.data?.map((m) => (
                <li key={m.id} className="group relative">
                  <NavLink to={`/maps/${m.id}`} className={navCls}>
                    <MapIcon className="size-4 shrink-0 opacity-70" aria-hidden />
                    <span className="min-w-0 flex-1 truncate pr-12">{m.name}</span>
                  </NavLink>
                  <span className="absolute right-1 top-1/2 flex -translate-y-1/2 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                    <IconButton label={`Rename ${m.name}`} size="sm" className="hover:bg-neutral-300/60" onClick={() => setDialog({ kind: 'edit', map: m })}><Pencil className="size-3.5" aria-hidden /></IconButton>
                    <IconButton label={`Delete ${m.name}`} size="sm" className="hover:bg-neutral-300/60" onClick={() => setDialog({ kind: 'delete', map: m })}><Trash2 className="size-3.5" aria-hidden /></IconButton>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </nav>

      <div className="atlas-scroll mt-4 min-h-0 flex-1 overflow-y-auto border-t border-line px-3 pb-4 pt-3">
        {personal && (
          <div className="space-y-4">
            <Button
              data-tour="add-custom-pin"
              variant={placing ? 'primary' : 'secondary'}
              size="sm"
              className="w-full"
              icon={<MapPinPlus className="size-4" aria-hidden />}
              onClick={() => uiStore.set({ placingPin: !placing, selectedPinId: null })}
              aria-pressed={placing}
            >
              {placing ? 'Click the map… (cancel)' : 'Add custom pin'}
            </Button>
            <GroupFilterControl mapId={personal.params.mapId!} />
            <GroupsSection key={personal.params.mapId} mapId={personal.params.mapId!} />
          </div>
        )}
      </div>

      {dialog?.kind === 'edit' && <MapFormDialog map={dialog.map} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'delete' && <DeleteMapDialog map={dialog.map} onClose={() => setDialog(null)} />}
    </div>
  );
}

function MapFormDialog({ map, onClose }: { map?: PersonalMap; onClose: () => void }) {
  const toast = useToast();
  const ws = useWorkspace();
  const navigate = useNavigate();
  const { create, update } = useMapMutations();
  const [name, setName] = useState(map?.name ?? '');
  const [description, setDescription] = useState(map?.description ?? '');
  const [touched, setTouched] = useState(false);
  const mutation = map ? update : create;
  const submit = () => {
    setTouched(true);
    if (!name.trim()) return;
    if (map) update.mutate({ id: map.id, name, description }, { onSuccess: () => { toast.success('Map updated.'); onClose(); } });
    else create.mutate({ name, description }, { onSuccess: (m) => { toast.success('Map created.'); onClose(); navigate(`/maps/${m.id}`); } });
  };
  return (
    <Dialog open onClose={onClose} size="sm" title={map ? 'Rename map' : 'New private map'} dismissible={!mutation.isPending}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={mutation.isPending} onClick={submit}>{map ? 'Save' : 'Create map'}</Button></>}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <TextField label="Name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} error={touched && !name.trim() ? 'Enter a name.' : null} />
        <TextArea label="Description (optional)" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
        <p className="text-xs text-neutral-500">{ws.isLocal ? 'Saved only in this browser on this device.' : 'Personal maps are always private to you.'}</p>
        <ErrorMessage error={mutation.error} />
      </form>
    </Dialog>
  );
}

function DeleteMapDialog({ map, onClose }: { map: PersonalMap; onClose: () => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const current = useMatch('/maps/:mapId');
  const { remove } = useMapMutations();
  return (
    <ConfirmDialog
      open danger busy={remove.isPending}
      title={`Delete “${map.name}”?`}
      confirmLabel="Delete map"
      message="All pins on this map will be deleted. Your groups, other maps and any copies you shared to collaboration maps are kept."
      onClose={onClose}
      onConfirm={() => remove.mutate(map.id, {
        onSuccess: () => {
          toast.success('Map deleted.');
          onClose();
          if (current?.params.mapId === map.id) navigate('/maps');
        },
        onError: (e) => toast.error(e),
      })}
    />
  );
}
