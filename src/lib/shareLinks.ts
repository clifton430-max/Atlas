/**
 * Atlas share links — stable identifiers only (never names):
 *   /?place=osm:node/123&at=40.74844,-73.98566   Discover place (OSM element + where to look)
 *   /?event=<event uuid>                         Discover event
 *   /maps/<map uuid>?pin=<pin uuid>              personal pin (private: opens only for its owner)
 *   /collab/<map uuid>?pin=<shared pin uuid>     collaboration pin (members only; RLS)
 *   /chess/<game uuid>                           online chess game (its two players only; RLS)
 *   /chess?venue=osm:node/…                      a venue's chess room
 *   /chess?moves=e4+e5+Nf3                       a copy of a local position (replayed and
 *                                                validated by the rules engine on open)
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

export const chessGameLink = (gameId: string) => `${origin()}/chess/${gameId}`;
export function chessRoomLink(venue?: string | null): string {
  return venue && REF.test(venue) ? `${origin()}/chess?${new URLSearchParams({ venue })}` : `${origin()}/chess`;
}
/** A shareable copy of a local game: its moves in SAN (validated again when opened). */
export function chessPositionLink(sans: string[], venue?: string | null): string {
  const p = new URLSearchParams({ moves: sans.join(' ') });
  if (venue && REF.test(venue)) p.set('venue', venue);
  return `${origin()}/chess?${p}`;
}
/** SAN tokens from a shared position link (shape check only; legality is checked by replay). */
export function parseChessMoves(params: URLSearchParams): string[] | null {
  const raw = params.get('moves');
  if (!raw) return null;
  const sans = raw.trim().split(/\s+/).filter(Boolean);
  if (sans.length === 0 || sans.length > 600 || !sans.every((m) => /^[a-hKQRBNOx1-8=+#-]{2,8}$/.test(m))) return null;
  return sans;
}
export const isUuid = (v: string | null | undefined) => !!v && UUID.test(v);
