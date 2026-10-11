import { describe, expect, it } from 'vitest';
import { osrmUrl, parseOsrm, parseRouteRequest } from '../../supabase/functions/_shared/routing';

const from = { lat: 38.6448, lng: -90.2615 };
const to = { lat: 38.6270, lng: -90.1994 };

describe('route edge function helpers', () => {
  it('validates input and refuses absurd distances', () => {
    expect(parseRouteRequest({ from, to, mode: 'walking' })).toEqual({ from, to, mode: 'walking' });
    expect(parseRouteRequest({ from, to, mode: 'flying' })).toEqual({ error: 'invalid_mode' });
    expect(parseRouteRequest({ from: { lat: 200, lng: 0 }, to, mode: 'driving' })).toEqual({ error: 'invalid_coordinates' });
    expect(parseRouteRequest({ from, to: { lat: 48.85, lng: 2.35 }, mode: 'walking' })).toEqual({ error: 'too_far' });
  });
  it('builds a per-profile OSRM URL (lng,lat order)', () => {
    const u = osrmUrl('https://routing.openstreetmap.de/', { from, to, mode: 'walking' });
    expect(u).toContain('/routed-foot/route/v1/driving/-90.261500,38.644800;-90.199400,38.627000');
    expect(osrmUrl('https://x', { from, to, mode: 'driving' })).toContain('/routed-car/');
  });
  it('parses routes, reports unreachable destinations, and rejects malformed data', () => {
    const ok = parseOsrm({ code: 'Ok', routes: [{ distance: 6012.4, duration: 4501.6, geometry: { type: 'LineString', coordinates: [[-90.26, 38.64], [-90.2, 38.63]] } }] }, 'walking');
    expect(ok).toMatchObject({ distanceMeters: 6012, durationSeconds: 4502, geometry: [[-90.26, 38.64], [-90.2, 38.63]] });
    expect(parseOsrm({ code: 'NoRoute' }, 'driving')).toBeNull();
    expect(() => parseOsrm({ code: 'Ok', routes: [{ distance: 'x' }] }, 'driving')).toThrow();
    expect(() => parseOsrm({ code: 'InvalidUrl' }, 'driving')).toThrow();
  });
});
