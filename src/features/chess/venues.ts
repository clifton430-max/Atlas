/**
 * Places where Atlas offers a chess room, matched by STABLE OpenStreetMap id
 * (never by name: a different, older "World Chess Hall of Fame" building in
 * Miami exists in OSM too). Verified 2026-10-10 against the OSM API:
 * node 9209122821 = tourism=museum, 4652 Maryland Avenue, Saint Louis,
 * wikidata Q8035502.
 */
export const CHESS_VENUES: Record<string, { name: string }> = {
  'osm:node/9209122821': { name: 'World Chess Hall of Fame' },
};

export const isChessVenue = (ref: string | null | undefined) => !!ref && ref in CHESS_VENUES;
export const chessRoomPath = (ref: string) => `/chess?venue=${encodeURIComponent(ref)}`;
