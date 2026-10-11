/**
 * 3D monuments on a personal map: renders placements (MonumentLayer), the
 * placement workflow (translucent ghost follows the pointer -> click to set
 * -> rotate / resize -> confirm or cancel), and the inspector for a selected
 * placement (inspect, reposition, rotate, resize, remove).
 *
 * Placing never consumes the collectible; any number of placements (up to
 * 100 per map) may use the same owned monument. Everything is persisted in
 * public.monument_placements (RLS: owner only, owned monuments only).
 */
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { MapMouseEvent } from 'maplibre-gl';
import { Check, Move, RotateCcw, RotateCw, Trash2, X } from 'lucide-react';
import { uiStore, useUi, type MonumentDraft } from '@/app/store';
import { InspectorPortal } from '@/app/Inspector';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { useMapInstance } from '@/features/map/MapContext';
import { MONUMENT_BY_DEF, RARITY } from './catalog';
import { useInventory, usePlacementMutations, usePlacements, type Placement } from './api';
import type { MonumentLayer as MonumentLayerType } from './three/MonumentLayer';

const ModelViewer = lazy(() => import('./three/ModelViewer'));

export function MonumentsOnMap({ mapId }: { mapId: string }) {
  const { map, styleVersion } = useMapInstance();
  const placements = usePlacements(mapId);
  const inventory = useInventory();
  const draft = useUi((s) => s.placingMonument);
  const selectedId = useUi((s) => s.selectedPlacementId);
  const toast = useToast();
  const layerRef = useRef<MonumentLayerType | null>(null);
  const [layerReady, setLayerReady] = useState(0);
  const [params, setParams] = useSearchParams();
  const needed = !!placements.data?.length || !!draft;

  // ?placeMonument=<defId> (from the collection / crate reveal) starts placement mode.
  useEffect(() => {
    const defId = params.get('placeMonument');
    if (!defId || !inventory.data) return;
    if (inventory.data.some((i) => i.defId === defId) && MONUMENT_BY_DEF.has(defId)) {
      const c = map?.getCenter();
      uiStore.set({ placingMonument: { defId, editingId: null, latitude: c?.lat ?? null, longitude: c?.lng ?? null, fixed: false, rotationDeg: 0, scale: 1 }, selectedPlacementId: null, selectedPinId: null });
    } else {
      toast.info('You don’t own that monument yet.');
    }
    setParams((p) => { p.delete('placeMonument'); return p; }, { replace: true });
  }, [params, inventory.data, map, setParams, toast]);

  // Create / remove the custom layer (lazy three.js), re-adding after style changes.
  useEffect(() => {
    if (!map || styleVersion === 0 || !needed) return;
    let cancelled = false;
    void import('./three/MonumentLayer').then(({ MonumentLayer, MONUMENT_LAYER_ID }) => {
      if (cancelled || map.getLayer(MONUMENT_LAYER_ID)) return;
      const layer = new MonumentLayer();
      layer.onError = (defId) => toast.error(`The 3D model for ${MONUMENT_BY_DEF.get(defId)?.name ?? 'a monument'} couldn’t be loaded.`);
      const before = map.getStyle()?.layers?.find((l) => l.type === 'symbol')?.id;
      map.addLayer(layer, before);
      layerRef.current = layer;
      setLayerReady((n) => n + 1);
    });
    return () => {
      cancelled = true;
      if (map.getStyle() && map.getLayer('atlas-monuments')) map.removeLayer('atlas-monuments');
      layerRef.current = null;
    };
  }, [map, styleVersion, needed, toast]);

  // Feed placements (+ ghost) to the layer.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const list = (placements.data ?? []).filter((p) => p.id !== draft?.editingId);
    const ghost = draft && draft.latitude != null && draft.longitude != null
      ? { id: 'ghost', defId: draft.defId, latitude: draft.latitude, longitude: draft.longitude, rotationDeg: draft.rotationDeg, scale: draft.scale } : null;
    layer.setPlacements(list, ghost);
  }, [placements.data, draft, layerReady]);

  // Pointer: ghost follows until a position is clicked; otherwise clicks select monuments.
  useEffect(() => {
    if (!map) return;
    const onMove = (e: MapMouseEvent) => {
      const d = uiStore.get().placingMonument;
      if (d && !d.fixed) uiStore.set({ placingMonument: { ...d, latitude: e.lngLat.lat, longitude: e.lngLat.lng } });
    };
    const onClick = (e: MapMouseEvent) => {
      const s = uiStore.get();
      if (s.placingPin || s.movingPinId) return;
      if (s.placingMonument) {
        uiStore.set({ placingMonument: { ...s.placingMonument, latitude: e.lngLat.lat, longitude: e.lngLat.lng, fixed: true } });
        return;
      }
      const hit = layerRef.current?.hitTest(e.point);
      if (hit) uiStore.set({ selectedPlacementId: hit.id, selectedPinId: null });
    };
    map.on('mousemove', onMove);
    map.on('click', onClick);
    map.getCanvas().style.cursor = draft && !draft.fixed ? 'crosshair' : '';
    return () => { map.off('mousemove', onMove); map.off('click', onClick); };
  }, [map, draft]);

  // Leaving the map clears transient state.
  useEffect(() => () => uiStore.set({ placingMonument: null, selectedPlacementId: null }), [mapId]);

  const selected = placements.data?.find((p) => p.id === selectedId) ?? null;
  return (
    <>
      {draft && <PlacementControls mapId={mapId} draft={draft} />}
      {selected && !draft && (
        <InspectorPortal title="Monument" openKey={`placement:${selected.id}`} closeLabel="Close monument details" onClose={() => uiStore.set({ selectedPlacementId: null })}>
          <PlacementInspector key={selected.id} mapId={mapId} placement={selected} />
        </InspectorPortal>
      )}
    </>
  );
}

function PlacementControls({ mapId, draft }: { mapId: string; draft: MonumentDraft }) {
  const def = MONUMENT_BY_DEF.get(draft.defId)!;
  const { create, update } = usePlacementMutations(mapId);
  const toast = useToast();
  const set = (patch: Partial<MonumentDraft>) => uiStore.set({ placingMonument: { ...draft, ...patch } });
  const rotate = (by: number) => set({ rotationDeg: (((draft.rotationDeg + by) % 360) + 360) % 360 });
  const cancel = () => uiStore.set({ placingMonument: null });
  const busy = create.isPending || update.isPending;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'Escape') cancel();
      if (e.key.toLowerCase() === 'r') rotate(e.shiftKey ? -15 : 15);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const confirm = () => {
    if (draft.latitude == null || draft.longitude == null) return;
    const body = { defId: draft.defId, latitude: draft.latitude, longitude: draft.longitude, rotationDeg: draft.rotationDeg, scale: draft.scale };
    const done = (msg: string) => () => { toast.success(msg); uiStore.set({ placingMonument: null }); };
    if (draft.editingId) update.mutate({ id: draft.editingId, ...body }, { onSuccess: done(`${def.name} updated.`), onError: (e) => toast.error(e) });
    else create.mutate(body, { onSuccess: (p) => { done(`${def.name} placed on your map.`)(); uiStore.set({ selectedPlacementId: p.id }); }, onError: (e) => toast.error(e) });
  };

  return (
    <section aria-label={`Placing ${def.name}`} className="absolute left-1/2 top-4 z-20 w-[min(460px,calc(100%-24px))] -translate-x-1/2 rounded-2xl bg-white p-3 shadow-float ring-1 ring-black/5" data-testid="placement-controls">
      <div className="flex items-center gap-2">
        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: RARITY[def.rarity].soft, color: RARITY[def.rarity].ink }}>{RARITY[def.rarity].label}</span>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{draft.editingId ? 'Editing' : 'Placing'} {def.name}</p>
        <button type="button" aria-label="Cancel placement" className="rounded p-1 text-neutral-500 hover:bg-neutral-100" onClick={cancel}><X className="size-4" aria-hidden /></button>
      </div>
      <p className="mt-1 text-xs text-neutral-600" role="status">
        {draft.fixed ? 'Position set. Adjust rotation and size, then confirm — or click the map again to move it.' : 'Move over the map and click to position the monument.'}
      </p>
      <div className="mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-2 text-xs">
        <button type="button" aria-label="Rotate left 15°" className="rounded-lg p-1.5 ring-1 ring-line hover:bg-neutral-50" onClick={() => rotate(-15)}><RotateCcw className="size-4" aria-hidden /></button>
        <label className="flex items-center gap-2">Rotation
          <input type="range" min={0} max={359} value={Math.round(draft.rotationDeg)} onChange={(e) => set({ rotationDeg: Number(e.target.value) })} className="flex-1" aria-valuetext={`${Math.round(draft.rotationDeg)} degrees`} />
          <span className="w-9 text-right tabular-nums">{Math.round(draft.rotationDeg)}°</span>
        </label>
        <button type="button" aria-label="Rotate right 15°" className="rounded-lg p-1.5 ring-1 ring-line hover:bg-neutral-50" onClick={() => rotate(15)}><RotateCw className="size-4" aria-hidden /></button>
        <span />
        <label className="flex items-center gap-2">Size
          <input type="range" min={0.25} max={4} step={0.05} value={draft.scale} onChange={(e) => set({ scale: Number(e.target.value) })} className="flex-1" aria-valuetext={`${draft.scale.toFixed(2)} times`} />
          <span className="w-9 text-right tabular-nums">{draft.scale.toFixed(2)}×</span>
        </label>
        <span />
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={cancel} disabled={busy}>Cancel</Button>
        <Button size="sm" variant="cta" icon={<Check className="size-4" aria-hidden />} loading={busy} disabled={!draft.fixed} onClick={confirm}>{draft.editingId ? 'Save changes' : 'Place monument'}</Button>
      </div>
    </section>
  );
}

function PlacementInspector({ mapId, placement }: { mapId: string; placement: Placement }) {
  const def = MONUMENT_BY_DEF.get(placement.defId);
  const { remove } = usePlacementMutations(mapId);
  const toast = useToast();
  const { map } = useMapInstance();
  const [confirm, setConfirm] = useState(false);
  if (!def) return <p className="p-4 text-sm">Unknown monument.</p>;
  const edit = (fixed: boolean) => uiStore.set({ placingMonument: { defId: def.defId, editingId: placement.id, latitude: placement.latitude, longitude: placement.longitude, fixed, rotationDeg: placement.rotationDeg, scale: placement.scale } });
  return (
    <article aria-label={`Monument: ${def.name}`} className="space-y-3 p-4 pt-0">
      <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-canvas" />}>
        <ModelViewer defId={def.defId} label={def.name} glow={RARITY[def.rarity].color} className="h-48 rounded-2xl bg-gradient-to-b from-canvas to-white" />
      </Suspense>
      <div>
        <h3 className="text-xl font-semibold tracking-tight">{def.name}</h3>
        <p className="mt-1 flex items-center gap-2 text-[13px]">
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: RARITY[def.rarity].soft, color: RARITY[def.rarity].ink }}>{RARITY[def.rarity].label}</span>
          <span className="text-neutral-600">{def.region}</span>
        </p>
      </div>
      <p className="text-[13px] text-neutral-700">{def.description}</p>
      <p className="text-xs text-neutral-500">A collectible miniature you placed on this private map — not the real landmark’s location.{' '}
        {def.latitude != null && def.longitude != null
          ? <button type="button" className="underline" onClick={() => map?.flyTo({ center: [def.longitude!, def.latitude!], zoom: 15 })}>Fly to the real {def.name}</button>
          : <span>{def.name} is a fictional Atlas Original.</span>}
      </p>
      <dl className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg bg-canvas p-2"><dt className="text-neutral-500">Rotation</dt><dd className="font-semibold">{Math.round(placement.rotationDeg)}°</dd></div>
        <div className="rounded-lg bg-canvas p-2"><dt className="text-neutral-500">Size</dt><dd className="font-semibold">{placement.scale.toFixed(2)}×</dd></div>
        <div className="rounded-lg bg-canvas p-2"><dt className="text-neutral-500">Placed at</dt><dd className="font-semibold tabular-nums">{placement.latitude.toFixed(3)}, {placement.longitude.toFixed(3)}</dd></div>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<Move className="size-4" aria-hidden />} onClick={() => edit(false)}>Reposition</Button>
        <Button size="sm" icon={<RotateCw className="size-4" aria-hidden />} onClick={() => edit(true)}>Rotate or resize</Button>
        <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setConfirm(true)}>Remove</Button>
      </div>
      <p className="text-[11px] text-neutral-500">{def.attribution}</p>
      <ConfirmDialog open={confirm} danger title={`Remove ${def.name} from this map?`} message="It stays in your collection; you can place it again any time." confirmLabel="Remove" busy={remove.isPending}
        onClose={() => setConfirm(false)} onConfirm={() => remove.mutate(placement.id, {
          onSuccess: () => { setConfirm(false); uiStore.set({ selectedPlacementId: null }); toast.success('Removed from the map. Still in your collection.'); },
          onError: (e) => toast.error(e),
        })} />
    </article>
  );
}
