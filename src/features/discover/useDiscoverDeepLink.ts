/**
 * Opens an Atlas share link on Discover (?place=… / ?event=…, see
 * lib/shareLinks.ts). The place is resolved from the REAL basemap tiles by its
 * OSM id near the linked coordinates — never by name. Params are removed once
 * handled so a refresh doesn't re-trigger them.
 */
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { uiStore } from '@/app/store';
import { useMapInstance } from '@/features/map/MapContext';
import { osmFeatureId, PLACES_SOURCE } from '@/features/map/atlasStyle';
import { placeFromFeature } from '@/features/places/placeFromFeature';
import { parsePlaceRef } from '@/features/places/types';
import { useToast } from '@/components/ui/Toast';
import { parseDiscoverTarget } from '@/lib/shareLinks';
import { eventProvider } from '@/services/events';

export function useDiscoverDeepLink() {
  const [params, setParams] = useSearchParams();
  const { map, styleVersion } = useMapInstance();
  const toast = useToast();
  const target = parseDiscoverTarget(params);

  // ?at=lat,lng&landmark=Name — "Locate the real landmark" from the collection.
  const landmark = params.get('landmark');
  const at = params.get('at');
  useEffect(() => {
    if (!map || !landmark || !at || params.get('place')) return;
    const [lat, lng] = at.split(',').map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      map.flyTo({ center: [lng, lat], zoom: 15.5, duration: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 1600 });
      toast.info(`Showing the real location of ${landmark.slice(0, 80)}.`);
    }
    setParams((p) => { p.delete('at'); p.delete('landmark'); return p; }, { replace: true });
  }, [map, landmark, at, params, setParams, toast]);
  const key = target ? JSON.stringify(target) : '';

  useEffect(() => {
    if (!target || !map || styleVersion === 0) return;
    const clear = () => setParams((p) => { p.delete('place'); p.delete('at'); p.delete('event'); return p; }, { replace: true });
    if (target.kind === 'event') {
      // DiscoverView fetches events that aren't in the loaded viewport by id.
      uiStore.set({ selectedEventId: target.id, selectedPlace: null });
      void eventProvider.getById(target.id).then((e) => {
        if (e?.latitude != null && e.longitude != null) map.jumpTo({ center: [e.longitude, e.latitude], zoom: Math.max(map.getZoom(), 15) });
        else if (!e) toast.info('That event couldn’t be found. It may have ended or been removed by its provider.');
      }).catch(() => toast.info('That event couldn’t be loaded right now.'));
      clear();
      return;
    }
    const ref = parsePlaceRef(target.ref)!;
    const fid = osmFeatureId(ref.osmType, ref.osmId);
    let done = false;
    const resolve = () => {
      if (done) return;
      const f = map.querySourceFeatures(PLACES_SOURCE, { sourceLayer: 'poi' }).find((x) => Number(x.id) === fid);
      const place = f ? placeFromFeature(f) : null;
      done = true;
      if (place) uiStore.set({ selectedPlace: place, selectedEventId: null });
      else toast.info('That place isn’t on the map here any more, or isn’t a Discover category.');
      clear();
    };
    map.jumpTo({ center: [target.longitude, target.latitude], zoom: Math.max(map.getZoom(), 16.5) });
    map.once('idle', resolve);
    return () => { done = true; map.off('idle', resolve); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map, styleVersion]);
}
