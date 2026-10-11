/**
 * Personal Map context (/maps/:mapId). Shows ONLY the authenticated user's
 * pins for this map (RLS-scoped query), filtered by the per-map group filter.
 * Group filtering is a derived view and never mutates data. Supports placing
 * new custom pins by clicking the map.
 */
import { useCollectiblesAccount, usePlacements } from '@/features/collectibles/api';
import { loadMapView, saveMapView } from './mapViews';
import { Link } from 'react-router-dom';
import { MonumentsOnMap } from '@/features/collectibles/MonumentsOnMap';
import { usePinDeepLink } from '@/features/pins/usePinDeepLink';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import type { MapMouseEvent } from 'maplibre-gl';
import { MousePointerClick } from 'lucide-react';
import { uiStore, useGroupFilter, useUi } from '@/app/store';
import { useMapInstance } from '@/features/map/MapContext';
import { useGroups } from '@/features/groups/api';
import { applyGroupFilter, pruneGroupFilter } from '@/features/groups/groupFilter';
import { pinTitle, usePinMutations, usePins } from '@/features/pins/api';
import { useToast } from '@/components/ui/Toast';
import { PinMarker } from '@/features/pins/PinMarker';
import { PinDetailsCard } from '@/features/pins/PinDetailsCard';
import { CustomPinDialog } from '@/features/pins/CustomPinDialog';
import { Button } from '@/components/ui/Button';
import { ErrorMessage, Spinner } from '@/components/ui/Feedback';
import { useMaps } from './api';
import { InspectorPortal } from '@/app/Inspector';

export function PersonalMapView() {
  const { mapId = '' } = useParams();
  const { map } = useMapInstance();
  const maps = useMaps();
  const pins = usePins(mapId);
  const groups = useGroups();
  const [filter, setFilter] = useGroupFilter(mapId);
  const selectedPinId = useUi((s) => s.selectedPinId);
  const placing = useUi((s) => s.placingPin);
  const newPinAt = useUi((s) => s.newPinAt);
  const movingPinId = useUi((s) => s.movingPinId);
  const moveTarget = useUi((s) => s.moveTarget);
  const { updateDetails } = usePinMutations();
  const toast = useToast();
  const current = maps.data?.find((m) => m.id === mapId);
  const { signedIn: placementsEnabled } = useCollectiblesAccount();

  // Drop selections for groups that were deleted.
  useEffect(() => {
    if (!groups.data) return;
    const pruned = pruneGroupFilter(filter, groups.data.map((g) => g.id));
    if (pruned !== filter) setFilter(pruned);
  }, [groups.data, filter, setFilter]);

  const visible = useMemo(() => applyGroupFilter(pins.data ?? [], filter), [pins.data, filter]);
  const groupColor = useMemo(() => new Map((groups.data ?? []).map((g) => [g.id, g.color])), [groups.data]);
  const selected = pins.data?.find((p) => p.id === selectedPinId) ?? null;
  usePinDeepLink(pins.data, (id) => uiStore.set({ selectedPinId: id }));

  // Placement mode: next map click chooses the custom pin location.
  const onMapClick = useCallback((e: MapMouseEvent) => {
    const s = uiStore.get();
    if (s.movingPinId) {
      uiStore.set({ moveTarget: { latitude: e.lngLat.lat, longitude: e.lngLat.lng } });
      return;
    }
    if (!s.placingPin) return;
    uiStore.set({ placingPin: false, newPinAt: { latitude: e.lngLat.lat, longitude: e.lngLat.lng } });
  }, []);
  const cancelMove = () => uiStore.set({ movingPinId: null, moveTarget: null });
  const saveMove = () => {
    if (!movingPinId || !moveTarget) return;
    updateDetails.mutate({ pinId: movingPinId, ...moveTarget }, {
      onSuccess: () => { cancelMove(); toast.success('Pin moved.'); },
      onError: (e) => toast.error(e),
    });
  };
  useEffect(() => {
    if (!map) return;
    map.on('click', onMapClick);
    map.getCanvas().style.cursor = placing || movingPinId ? 'crosshair' : '';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && uiStore.set({ placingPin: false, movingPinId: null, moveTarget: null });
    if (placing || movingPinId) window.addEventListener('keydown', onKey);
    return () => {
      map.off('click', onMapClick);
      map.getCanvas().style.cursor = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [map, onMapClick, placing, movingPinId]);

  // Viewport memory: restore this map's last view if nothing of it is on screen; save it on leave.
  const placements = usePlacements(mapId);
  const restored = useRef<string | null>(null);
  useEffect(() => {
    if (!map || restored.current === mapId || !pins.isSuccess || (placementsEnabled && placements.isLoading)) return;
    restored.current = mapId;
    const b = map.getBounds();
    const pts = [...(pins.data ?? []).filter((p) => p.latitude != null).map((p) => [p.longitude!, p.latitude!]),
      ...(placements.data ?? []).map((p) => [p.longitude, p.latitude])];
    const anyVisible = pts.some(([lng, lat]) => b.contains([lng, lat]));
    const saved = loadMapView(mapId);
    if (!anyVisible && saved) map.easeTo({ ...saved, duration: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 900 });
  }, [map, mapId, pins.isSuccess, pins.data, placements.data, placements.isLoading, placementsEnabled]);
  useEffect(() => () => {
    if (!map) return;
    const c = map.getCenter();
    saveMapView(mapId, { center: [c.lng, c.lat], zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() });
  }, [map, mapId]);

  // Leaving this map clears its transient state.
  useEffect(() => () => uiStore.set({ selectedPinId: null, placingPin: false, newPinAt: null, movingPinId: null, moveTarget: null }), [mapId]);

  if (maps.isSuccess && !current) {
    return <Overlay><ErrorMessage error="This map doesn’t exist or you don’t have access to it." /></Overlay>;
  }

  return (
    <>
      {visible.map((p, i) =>
        p.latitude != null && p.longitude != null ? (
          <PinMarker
            key={p.id}
            revealDelay={Math.min(i * 45, 600)}
            latitude={p.id === movingPinId && moveTarget ? moveTarget.latitude : p.latitude}
            longitude={p.id === movingPinId && moveTarget ? moveTarget.longitude : p.longitude}
            label={`${pinTitle(p)}${p.groupIds.length ? '' : ' (no group)'}`}
            appearance={p.appearance}
            image={p.image}
            fallbackIcon={p.kind === 'event' ? 'ticket' : 'map-pin'}
            groupColors={p.groupIds.map((g) => groupColor.get(g)).filter((c): c is string => !!c)}
            selected={p.id === selectedPinId}
            onSelect={() => uiStore.set({ selectedPinId: p.id })}
          />
        ) : null,
      )}

      {(pins.isLoading || maps.isLoading) && <Overlay><Spinner label="Loading pins" /></Overlay>}
      {pins.error && <Overlay><ErrorMessage error={pins.error} /></Overlay>}

      {placing && (
        <div className="absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white shadow-float" role="status">
          <MousePointerClick className="size-4" aria-hidden />
          Click the map to place your pin.
          <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" onClick={() => uiStore.set({ placingPin: false })}>Cancel (Esc)</Button>
        </div>
      )}

      {movingPinId && (
        <div className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white shadow-float" role="status">
          <MousePointerClick className="size-4" aria-hidden />
          {moveTarget ? 'New location chosen.' : 'Click the map to choose the new location.'}
          <Button size="sm" variant="primary" className="bg-white text-neutral-900 hover:bg-neutral-100" disabled={!moveTarget} loading={updateDetails.isPending} onClick={saveMove}>Save location</Button>
          <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" onClick={cancelMove}>Cancel</Button>
        </div>
      )}

      {selected && (
        <InspectorPortal title="Pin details" openKey={`pin:${selected.id}`}>
          <PinDetailsCard key={selected.id} pin={selected} groups={groups.data ?? []} onClose={() => uiStore.set({ selectedPinId: null })} />
        </InspectorPortal>
      )}

      <MonumentsOnMap mapId={mapId} />
      {pins.isSuccess && (pins.data?.length ?? 0) === 0 && !(placements.data?.length) && !placing && !newPinAt && <EmptyWorld />}
      {newPinAt && <CustomPinDialog mapId={mapId} at={newPinAt} onClose={() => uiStore.set({ newPinAt: null })} />}
    </>
  );
}

/** A designed, actionable empty state for a personal world with nothing on it yet. */
function EmptyWorld() {
  const { signedIn } = useCollectiblesAccount();
  return (
    <section aria-label="Your map is empty" className="absolute bottom-28 left-1/2 z-10 w-[min(420px,calc(100%-24px))] -translate-x-1/2 rounded-2xl bg-white/95 p-4 text-center shadow-float ring-1 ring-black/5 backdrop-blur animate-rise-in">
      <p className="text-[15px] font-semibold">Your map is waiting for its first landmark</p>
      <p className="mt-1 text-xs text-neutral-600">Pins, saved places and 3D monuments you add appear here, in your personal world.</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <Button size="sm" variant="cta" onClick={() => uiStore.set({ placingPin: true, selectedPinId: null })}>Add a pin</Button>
        <Link to={signedIn ? '/treasure?tab=collection' : '/treasure'} className="inline-flex h-8 items-center rounded-lg px-3 text-[13px] font-medium ring-1 ring-line hover:bg-neutral-50">Place a monument</Link>
        <Link to="/" className="inline-flex h-8 items-center rounded-lg px-3 text-[13px] font-medium text-brand hover:bg-neutral-50">Explore Discover</Link>
      </div>
    </section>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-xl bg-white px-4 py-2 shadow-panel">{children}</div>;
}
