/**
 * Decorative aircraft (pure helpers, unit-tested). A plane flies in a
 * straight line between two GEOGRAPHIC points chosen just outside the visible
 * map, so it pans and zooms with the map and enters/leaves the view
 * naturally. Direction, speed, livery and timing are random. These are not
 * real flights — no flight data is used, and the legend says so.
 */
import type * as maplibregl from 'maplibre-gl';

export interface Plane {
  from: [number, number];
  to: [number, number];
  startedAt: number;
  durationMs: number;
  livery: number;
}

/** Choose a path across the current view (entering from one edge, leaving by the opposite side). */
export function makePlane(map: Pick<maplibregl.Map, 'getContainer' | 'unproject'>, now: number, rnd: () => number): Plane | null {
  const el = map.getContainer();
  const W = el.clientWidth; const H = el.clientHeight;
  if (W < 50 || H < 50) return null;
  const margin = 120;
  const edgePoint = (edge: number, t: number): [number, number] => {
    switch (edge) {
      case 0: return [-margin, t * H];
      case 1: return [W + margin, t * H];
      case 2: return [t * W, -margin];
      default: return [t * W, H + margin];
    }
  };
  const e = Math.floor(rnd() * 4);
  const a = edgePoint(e, 0.1 + rnd() * 0.8);
  const b = edgePoint(e ^ 1, 0.1 + rnd() * 0.8); // opposite edge (0<->1, 2<->3)
  const from = map.unproject(a); const to = map.unproject(b);
  return {
    from: [from.lng, from.lat], to: [to.lng, to.lat],
    startedAt: now, durationMs: 28_000 + rnd() * 22_000, livery: Math.floor(rnd() * 4),
  };
}

/** Current position (and a point slightly behind it, for heading); null once the flight is over. */
export function planePosition(p: Plane, now: number): { at: [number, number]; from: [number, number] } | null {
  const t = (now - p.startedAt) / p.durationMs;
  if (t < 0 || t > 1) return null;
  const lerp = (k: number): [number, number] => [p.from[0] + (p.to[0] - p.from[0]) * k, p.from[1] + (p.to[1] - p.from[1]) * k];
  return { at: lerp(t), from: lerp(Math.max(0, t - 0.01)) };
}
