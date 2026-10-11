/**
 * Opens ?pin=<id> on a personal or collaboration map once that map's pins are
 * loaded (RLS decides whether the pin is visible at all). Selects it, centres
 * the map on it, then removes the param.
 */
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMapInstance } from '@/features/map/MapContext';
import { useToast } from '@/components/ui/Toast';
import { parsePinParam } from '@/lib/shareLinks';

export function usePinDeepLink(pins: { id: string; latitude: number | null; longitude: number | null }[] | undefined, select: (id: string) => void) {
  const [params, setParams] = useSearchParams();
  const { map } = useMapInstance();
  const toast = useToast();
  const id = parsePinParam(params);
  useEffect(() => {
    if (!id || !pins || !map) return;
    const pin = pins.find((p) => p.id === id);
    if (pin) {
      select(pin.id);
      if (pin.latitude != null && pin.longitude != null) map.jumpTo({ center: [pin.longitude, pin.latitude], zoom: Math.max(map.getZoom(), 15) });
    } else {
      toast.info('That pin isn’t on this map, or you don’t have access to it.');
    }
    setParams((p) => { p.delete('pin'); return p; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, pins, map]);
}
