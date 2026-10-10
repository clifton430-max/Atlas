/**
 * Personal Map context (/maps/:mapId). Shows ONLY the authenticated user's
 * pins for this map (RLS-scoped query), filtered by the per-map group filter.
 * Group filtering is a derived view and never mutates data. Supports placing
 * new custom pins by clicking the map.
 */
import { useCallback, useEffect, useMemo } from 'react';
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

  // Drop selections for groups that were deleted.
  useEffect(() => {
    if (!groups.data) return;
    const pruned = pruneGroupFilter(filter, groups.data.map((g) => g.id));
    if (pruned !== filter) setFilter(pruned);
  }, [groups.data, filter, setFilter]);

  const visible = useMemo(() => applyGroupFilter(pins.data ?? [], filter), [pins.data, filter]);
  const groupColor = useMemo(() => new Map((groups.data ?? []).map((g) => [g.id, g.color])), [groups.data]);
  const selected = pins.data?.find((p) => p.id === selectedPinId) ?? null;

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

  // Leaving this map clears its transient state.
  useEffect(() => () => uiStore.set({ selectedPinId: null, placingPin: false, newPinAt: null, movingPinId: null, moveTarget: null }), [mapId]);

  if (maps.isSuccess && !current) {
    return <Overlay><ErrorMessage error="This map doesn’t exist or you don’t have access to it." /></Overlay>;
  }

  return (
    <>
      {visible.map((p) =>
        p.latitude != null && p.longitude != null ? (
          <PinMarker
            key={p.id}
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
        <div className="absolute left-1/2 top-[68px] z-10 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white shadow-float" role="status">
          <MousePointerClick className="size-4" aria-hidden />
          Click the map to place your pin.
          <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" onClick={() => uiStore.set({ placingPin: false })}>Cancel (Esc)</Button>
        </div>
      )}

      {movingPinId && (
        <div className="absolute left-1/2 top-[68px] z-20 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white shadow-float" role="status">
          <MousePointerClick className="size-4" aria-hidden />
          {moveTarget ? 'New location chosen.' : 'Click the map to choose the new location.'}
          <Button size="sm" variant="primary" className="bg-white text-neutral-900 hover:bg-neutral-100" disabled={!moveTarget} loading={updateDetails.isPending} onClick={saveMove}>Save location</Button>
          <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" onClick={cancelMove}>Cancel</Button>
        </div>
      )}

      {selected && (
        <div className="absolute left-4 top-[68px] z-10">
          <PinDetailsCard key={selected.id} pin={selected} groups={groups.data ?? []} onClose={() => uiStore.set({ selectedPinId: null })} />
        </div>
      )}

      {newPinAt && <CustomPinDialog mapId={mapId} at={newPinAt} onClose={() => uiStore.set({ newPinAt: null })} />}
    </>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return <div className="absolute left-1/2 top-[68px] z-10 -translate-x-1/2 rounded-xl bg-white px-4 py-2 shadow-panel">{children}</div>;
}
