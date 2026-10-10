/**
 * Map context, provided at the APP SHELL level (not inside the canvas) so
 * that panels, search and overlays outside the canvas element can also drive
 * the map (fly-to, ease-to).
 *
 * Split in two so that frequent zoom updates only re-render consumers that
 * need them (markers), not every panel.
 */
import { createContext, useContext, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type * as maplibregl from 'maplibre-gl';

export interface MapInstanceValue {
  map: maplibregl.Map | null;
  /**
   * Increments on every 'style.load'. 0 = no style loaded yet. Layer-owning
   * components (re)attach their sources/layers when this changes.
   */
  styleVersion: number;
}

interface Registrar {
  setInstance: Dispatch<SetStateAction<MapInstanceValue>>;
  setZoom: Dispatch<SetStateAction<number>>;
}

const InstanceContext = createContext<MapInstanceValue>({ map: null, styleVersion: 0 });
/** Current zoom (rAF-throttled) used to scale HTML markers. */
const ZoomContext = createContext<number>(0);
const RegistrarContext = createContext<Registrar | null>(null);

export function MapProvider({ children }: { children: ReactNode }) {
  const [instance, setInstance] = useState<MapInstanceValue>({ map: null, styleVersion: 0 });
  const [zoom, setZoom] = useState(0);
  const registrar = useMemo(() => ({ setInstance, setZoom }), []);
  return (
    <RegistrarContext.Provider value={registrar}>
      <InstanceContext.Provider value={instance}>
        <ZoomContext.Provider value={zoom}>{children}</ZoomContext.Provider>
      </InstanceContext.Provider>
    </RegistrarContext.Provider>
  );
}

/** Map instance + style version (does not re-render on zoom). */
export const useMapInstance = () => useContext(InstanceContext);

/** Map instance, style version and zoom (re-renders on zoom; use for markers). */
export function useMap() {
  const inst = useContext(InstanceContext);
  const zoom = useContext(ZoomContext);
  return { ...inst, zoom };
}

/** Used by MapCanvas to publish its instance into the provider. */
export function useMapRegistrar(): Registrar {
  const r = useContext(RegistrarContext);
  if (!r) throw new Error('MapCanvas must be rendered inside <MapProvider>');
  return r;
}

/** Marker scale curve: smaller when zoomed out, full size at street level. */
export function zoomScale(zoom: number): number {
  return Math.max(0.6, Math.min(1.1, 0.6 + (zoom - 6) * 0.06));
}
