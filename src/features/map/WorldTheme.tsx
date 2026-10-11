/**
 * The two worlds:
 *   Discover (and Shared maps)  -> the explorer's city style (cityStyle.ts)
 *   My Maps (personal maps)     -> the personal world: the map's equipped skin,
 *                                  a temporary skin preview, or PERSONAL_DEFAULT
 *
 * Switching worlds never reloads the map: the theme is applied to / restored
 * from the live style, and MapLibre cross-fades the colours. A short
 * "cartographic sweep" plays over the map (a lighter fade on low-powered
 * devices; nothing under reduced motion). Personal skins never affect
 * collaboration maps or Discover.
 */
import { useEffect, useRef, useState } from 'react';
import { useMatch } from 'react-router-dom';
import { Eye, X } from 'lucide-react';
import { uiStore, useUi } from '@/app/store';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { SKIN_BY_DEF } from '@/features/collectibles/catalog';
import { useEquipSkin, useInventory, useMapSkin } from '@/features/collectibles/api';
import { PERSONAL_DEFAULT, skinThemeFor } from '@/features/collectibles/skins';
import { useToast } from '@/components/ui/Toast';
import { useMapInstance } from './MapContext';
import { SkinOverlayFx } from '@/features/collectibles/SkinOverlayFx';
import { applyTheme, resetThemeState, restoreTheme } from './themeApplier';

export type World = 'discover' | 'personal' | 'shared';

const lowPower = () => {
  const n = navigator as Navigator & { deviceMemory?: number };
  return (n.hardwareConcurrency ?? 8) <= 4 || (n.deviceMemory ?? 8) <= 4;
};

export function WorldTheme() {
  const { map, styleVersion } = useMapInstance();
  const personal = useMatch('/maps/:mapId');
  const shared = useMatch('/collab/*');
  const mapId = personal?.params.mapId;
  const world: World = mapId ? 'personal' : shared ? 'shared' : 'discover';
  const equipped = useMapSkin(mapId);
  const preview = useUi((s) => s.skinPreview);
  const previewing = preview && preview.mapId === mapId ? preview.defId : null;
  const theme = world !== 'personal' ? null : skinThemeFor(previewing ?? equipped.data) ?? PERSONAL_DEFAULT;

  // Apply / restore on the live style.
  const lastStyle = useRef(0);
  useEffect(() => {
    if (!map || styleVersion === 0) return;
    if (lastStyle.current !== styleVersion) { resetThemeState(map); lastStyle.current = styleVersion; }
    if (theme) applyTheme(map, theme);
    else restoreTheme(map);
  }, [map, styleVersion, theme]);

  // Sweep when the world changes (not on first load).
  const [sweep, setSweep] = useState<{ key: number; to: World } | null>(null);
  const prevWorld = useRef<World | null>(null);
  useEffect(() => {
    if (prevWorld.current && prevWorld.current !== world && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setSweep({ key: Date.now(), to: world });
    }
    prevWorld.current = world;
  }, [world]);
  useEffect(() => { if (!mapId) uiStore.set({ skinPreview: null }); }, [mapId]);

  return (
    <>
      {theme?.overlay && <SkinOverlayFx overlay={theme.overlay} />}
      {theme?.vignette && <div aria-hidden className="pointer-events-none absolute inset-0 z-[5] transition-opacity duration-700" style={{ background: `radial-gradient(ellipse at center, transparent 55%, ${theme.vignette} 100%)` }} />}
      {sweep && (
        <div key={sweep.key} aria-hidden data-testid="world-sweep" onAnimationEnd={() => setSweep(null)}
          className={cn('pointer-events-none absolute inset-0 z-[6]', lowPower() ? 'atlas-world-fade' : 'atlas-world-sweep', sweep.to === 'personal' ? 'atlas-sweep-personal' : 'atlas-sweep-discover')} />
      )}
      {previewing && mapId && <PreviewBanner mapId={mapId} defId={previewing} />}
    </>
  );
}

function PreviewBanner({ mapId, defId }: { mapId: string; defId: string }) {
  const inventory = useInventory();
  const equip = useEquipSkin(mapId);
  const toast = useToast();
  const owned = inventory.data?.some((i) => i.defId === defId);
  const name = SKIN_BY_DEF.get(defId)?.name ?? 'Skin';
  return (
    <div role="status" className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm shadow-float ring-1 ring-black/5">
      <Eye className="size-4 text-accent" aria-hidden />Previewing <span className="font-semibold">{name}</span> — not saved
      {owned && <Button size="sm" variant="cta" loading={equip.isPending} onClick={() => equip.mutate(defId, { onSuccess: () => { uiStore.set({ skinPreview: null }); toast.success(`${name} equipped on this map.`); }, onError: (e) => toast.error(e) })}>Equip</Button>}
      <button type="button" aria-label="Stop preview" className="rounded p-1 text-neutral-500 hover:bg-neutral-100" onClick={() => uiStore.set({ skinPreview: null })}><X className="size-4" aria-hidden /></button>
    </div>
  );
}
