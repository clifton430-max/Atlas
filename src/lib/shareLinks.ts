/**
 * Atlas share links — stable identifiers only (never names):
 *   /?place=osm:node/123&at=40.74844,-73.98566   Discover place (OSM element + where to look)
 *   /?event=<event uuid>                         Discover event
 *   /maps/<map uuid>?pin=<pin uuid>              personal pin (private: opens only for its owner)
 *   /collab/<map uuid>?pin=<shared pin uuid>     collaboration pin (members only; RLS)
 * Opening a link never grants access: the data behind it is still protected
 * by row-level security.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REF = /^osm:(node|way|relation)\/\d{1,15}$/;

const origin = () => (typeof window === 'undefined' ? 'https://atlas.invalid' : window.location.origin);

export function placeLink(ref: string, lat: number, lng: number): string {
  const p = new URLSearchParams({ place: ref, at: `${lat.toFixed(5)},${lng.toFixed(5)}` });
  return `${origin()}/?${p}`;
}
export const eventLink = (id: string) => `${origin()}/?${new URLSearchParams({ event: id })}`;
export const pinLink = (mapId: string, pinId: string) => `${origin()}/maps/${mapId}?pin=${pinId}`;
export const sharedPinLink = (collabMapId: string, pinId: string) => `${origin()}/collab/${collabMapId}?pin=${pinId}`;

export type DiscoverTarget =
  | { kind: 'place'; ref: string; latitude: number; longitude: number }
  | { kind: 'event'; id: string };

/** Parse Discover deep-link params; invalid input is ignored (null). */
export function parseDiscoverTarget(params: URLSearchParams): DiscoverTarget | null {
  const event = params.get('event');
  if (event && UUID.test(event)) return { kind: 'event', id: event };
  const place = params.get('place');
  const at = params.get('at')?.split(',').map(Number);
  if (place && REF.test(place) && at?.length === 2 && at.every(Number.isFinite)
    && Math.abs(at[0]) <= 90 && Math.abs(at[1]) <= 180) {
    return { kind: 'place', ref: place, latitude: at[0], longitude: at[1] };
  }
  return null;
}

export function parsePinParam(params: URLSearchParams): string | null {
  const pin = params.get('pin');
  return pin && UUID.test(pin) ? pin : null;
}
