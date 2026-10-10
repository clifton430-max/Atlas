/**
 * /collab/demo — a LOCAL demonstration of a collaboration map for guests and
 * the tutorial sandbox. It shows how sharing works (independent shared copies,
 * roles, removal) using sample members. Nothing is sent to anyone and nothing
 * is stored on a server; every surface is labelled "Demo".
 * Signed-in users are sent to their real collaboration maps instead.
 */
import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { FlaskConical, X } from 'lucide-react';
import { uiStore, useUi } from '@/app/store';
import { useWorkspace } from '@/features/workspace/WorkspaceProvider';
import { useLocalSnapshot } from '@/features/workspace/useLocalSnapshot';
import { PinMarker } from '@/features/pins/PinMarker';
import { Badge } from '@/components/ui/Feedback';
import { Button, IconButton } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { InspectorPortal } from '@/app/Inspector';

export function DemoCollabView() {
  const ws = useWorkspace();
  const snap = useLocalSnapshot(ws.local);
  const toast = useToast();
  const selectedId = useUi((s) => s.selectedSharedPinId);
  useEffect(() => () => uiStore.set({ selectedSharedPinId: null }), []);

  if (!ws.local || !snap) return <Navigate to="/" replace />;
  const shares = snap.demo.shares;
  const selected = shares.find((s) => s.id === selectedId) ?? null;
  const imageOf = (id: string | null) => {
    const img = id ? snap.images.find((i) => i.id === id) : null;
    return img ? { id: img.id, storagePath: `local:${img.id}`, mimeType: img.mimeType, byteSize: img.byteSize, width: img.width, height: img.height } : null;
  };

  return (
    <>
      {shares.map((s) => (
        <PinMarker key={s.id} latitude={s.latitude} longitude={s.longitude} label={`${s.title} (demo shared copy)`}
          appearance={s.appearance} image={imageOf(s.imageId)} fallbackIcon="map-pin"
          selected={s.id === selectedId} onSelect={() => uiStore.set({ selectedSharedPinId: s.id })} />
      ))}
      <div className="absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900 shadow-panel ring-1 ring-amber-200" role="status" data-tour="demo-banner">
        <FlaskConical className="size-4" aria-hidden />
        Demo collaboration map — stored only on this device. Nothing is sent to anyone.
      </div>
      {shares.length === 0 && (
        <div className="absolute bottom-24 left-1/2 z-10 -translate-x-1/2 rounded-xl bg-white px-4 py-2 text-sm text-neutral-600 shadow-panel">
          No shared pins yet. Open one of your pins and choose <strong>Share</strong> to add a copy here.
        </div>
      )}
      {selected && (
        <InspectorPortal title="Shared pin (demo)" openKey={`demo:${selected.id}`}>
        <article aria-label={`Demo shared pin: ${selected.title}`} className="w-full p-4 animate-rise-in">
          <header className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex gap-1.5"><Badge tone="warning">Demo</Badge><Badge tone="accent">Shared copy</Badge></div>
              <h2 className="truncate text-[15px] font-semibold">{selected.title}</h2>
            </div>
            <IconButton label="Close shared pin" size="sm" onClick={() => uiStore.set({ selectedSharedPinId: null })}><X className="size-4" aria-hidden /></IconButton>
          </header>
          <p className="mt-2 text-xs text-neutral-500">Shared by you. In a real collaboration map, members would see this copy — never your private original or its groups.</p>
          {selected.note && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-neutral-50 p-2 text-sm">{selected.note}</p>}
          <div className="mt-3 flex justify-end">
            <Button size="sm" onClick={() => {
              try {
                ws.local!.removeDemoShare(selected.id);
                uiStore.set({ selectedSharedPinId: null });
                toast.success('Removed the demo copy. Your original pin is unchanged.');
              } catch (e) { toast.error(e); }
            }}>Remove from demo map</Button>
          </div>
        </article>
        </InspectorPortal>
      )}
    </>
  );
}
