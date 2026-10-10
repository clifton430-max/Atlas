/**
 * Generic HTML map marker. Renders arbitrary React content as a MapLibre
 * Marker element via a portal, anchored at the given coordinates so it stays
 * attached while panning/zooming. Used for personal pins, image markers and
 * shared pins. Rendering stays separate from pin data/permission logic.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import * as maplibregl from 'maplibre-gl';
import { useMapInstance } from './MapContext';

export interface MapMarkerProps {
  longitude: number;
  latitude: number;
  children: ReactNode;
  /** Anchor point of the element relative to the coordinate. */
  anchor?: maplibregl.PositionAnchor;
  zIndex?: number;
  /** false for purely visual markers (previews, halos) so they never intercept map clicks. */
  interactive?: boolean;
}

export function MapMarker({ longitude, latitude, children, anchor = 'center', zIndex, interactive = true }: MapMarkerProps) {
  const { map } = useMapInstance();
  const [element] = useState(() => {
    const el = document.createElement('div');
    el.className = 'atlas-marker';
    return el;
  });
  const [marker, setMarker] = useState<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!map) return;
    const m = new maplibregl.Marker({ element, anchor }).setLngLat([longitude, latitude]).addTo(map);
    setMarker(m);
    return () => {
      m.remove();
      setMarker(null);
    };
    // Coordinates are synced in the effect below; recreate only on map/anchor change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, element, anchor]);

  useEffect(() => {
    marker?.setLngLat([longitude, latitude]);
  }, [marker, longitude, latitude]);

  useEffect(() => {
    element.style.zIndex = zIndex != null ? String(zIndex) : '';
    element.style.pointerEvents = interactive ? '' : 'none';
  }, [element, zIndex, interactive]);

  return createPortal(children, element);
}
