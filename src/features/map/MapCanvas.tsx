/**
 * The single, persistent MapLibre map. It lives in the AppShell (outside the
 * routed views) so switching between Discover, Personal and Collaboration
 * contexts — or collapsing panels — preserves the viewport. Routed views
 * attach their own layers/markers through MapContext.
 *
 * The style comes from env/profile (OpenFreeMap by default; no key needed).
 * The last viewport is remembered in localStorage.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as maplibregl from 'maplibre-gl';
// MapLibre v6 runs tile parsing in a separate, self-contained worker file.
// Hand Vite's emitted URL to MapLibre so it works in dev (pre-bundled deps)
// and in production builds alike.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { useMapInstance, useMapRegistrar } from './MapContext';
import { uiStore } from '@/app/store';
import { normalizeBBox } from '@/services/events/types';

maplibregl.setWorkerUrl(workerUrl);

const VIEWPORT_KEY = 'atlas.viewport';
const DEFAULT_VIEW = { center: [-73.985, 40.748] as [number, number], zoom: 11.5 };

function loadViewport() {
  try {
    const v = JSON.parse(localStorage.getItem(VIEWPORT_KEY) ?? 'null');
    if (v && Array.isArray(v.center) && typeof v.zoom === 'number') return v as typeof DEFAULT_VIEW;
  } catch {
    /* ignore */
  }
  return DEFAULT_VIEW;
}

export function MapCanvas({ styleUrl, children }: { styleUrl: string; children?: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { setInstance, setZoom } = useMapRegistrar();
  const { map } = useMapInstance();
  const [error, setError] = useState<string | null>(null);
  const initialStyle = useRef(styleUrl);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let instance: maplibregl.Map;
    try {
      const view = loadViewport();
      instance = new maplibregl.Map({
        container: el,
        style: initialStyle.current,
        center: view.center,
        zoom: view.zoom,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The map could not be initialized (WebGL may be unavailable).');
      return;
    }
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    instance.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    instance.getCanvas().setAttribute('aria-label', 'Interactive map. Use arrow keys to pan and plus/minus to zoom.');

    let raf = 0;
    const onZoom = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setZoom(instance.getZoom()));
    };
    let moveTimer: ReturnType<typeof setTimeout> | undefined;
    const publishBounds = () => {
      const b = instance.getBounds();
      uiStore.set({ bbox: normalizeBBox({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }) });
      try {
        const c = instance.getCenter();
        localStorage.setItem(VIEWPORT_KEY, JSON.stringify({ center: [c.lng, c.lat], zoom: instance.getZoom() }));
      } catch {
        /* ignore */
      }
    };
    // Debounced: Discover queries by visible bounds, not on every frame.
    const onMoveEnd = () => {
      clearTimeout(moveTimer);
      moveTimer = setTimeout(publishBounds, 350);
    };
    const onStyle = () => setInstance((s) => ({ ...s, styleVersion: s.styleVersion + 1 }));

    instance.on('zoom', onZoom);
    instance.on('moveend', onMoveEnd);
    instance.on('style.load', onStyle);
    instance.once('load', publishBounds);
    instance.on('error', (e) => {
      // Tile/style errors are logged but don't tear the app down.
      console.warn('[map]', e.error?.message ?? e);
    });
    setZoom(instance.getZoom());
    setInstance({ map: instance, styleVersion: 0 });
    // Dev-only handle for debugging and browser-driven verification.
    if (import.meta.env.DEV) (window as unknown as { __atlasMap?: maplibregl.Map }).__atlasMap = instance;

    // Keep the canvas sized correctly when panels collapse/expand.
    const ro = new ResizeObserver(() => instance.resize());
    ro.observe(el);

    return () => {
      ro.disconnect();
      clearTimeout(moveTimer);
      cancelAnimationFrame(raf);
      instance.remove();
      setInstance({ map: null, styleVersion: 0 });
    };
  }, [setInstance, setZoom]);

  // Apply style changes from settings without recreating the map.
  useEffect(() => {
    if (map && styleUrl !== initialStyle.current) {
      initialStyle.current = styleUrl;
      map.setStyle(styleUrl);
    }
  }, [map, styleUrl]);

  return (
    <>
      {/* MapLibre's own (unlayered) CSS sets position:relative on its container,
          which beats Tailwind's layered utilities — so size via a wrapper. */}
      <div className="absolute inset-0">
        <div ref={containerRef} className="h-full w-full" data-testid="map-canvas" />
      </div>
      {error && (
        <div role="alert" className="absolute inset-0 grid place-items-center bg-neutral-100 p-8 text-center text-sm text-neutral-600">
          <div>
            <p className="font-medium text-neutral-800">The map could not be displayed.</p>
            <p className="mt-1">{error}</p>
          </div>
        </div>
      )}
      {map && children}
    </>
  );
}
