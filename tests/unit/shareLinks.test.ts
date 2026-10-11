import { describe, expect, it } from 'vitest';
import { eventLink, parseDiscoverTarget, parsePinParam, pinLink, placeLink, sharedPinLink } from '@/lib/shareLinks';

const params = (url: string) => new URL(url).searchParams;

describe('Atlas share links', () => {
  it('round-trips places and events by stable id', () => {
    expect(parseDiscoverTarget(params(placeLink('osm:way/42', 40.748441, -73.985664)))).toEqual({ kind: 'place', ref: 'osm:way/42', latitude: 40.74844, longitude: -73.98566 });
    const id = '6f9619ff-8b86-4d11-b42d-00c04fc964ff';
    expect(parseDiscoverTarget(params(eventLink(id)))).toEqual({ kind: 'event', id });
  });
  it('rejects malformed or unsafe params', () => {
    expect(parseDiscoverTarget(new URLSearchParams('place=Eiffel%20Tower&at=1,2'))).toBeNull();
    expect(parseDiscoverTarget(new URLSearchParams('place=osm:node/1&at=999,2'))).toBeNull();
    expect(parseDiscoverTarget(new URLSearchParams('event=../../etc'))).toBeNull();
    expect(parsePinParam(new URLSearchParams('pin=1;drop'))).toBeNull();
  });
  it('pin links carry map and pin ids', () => {
    const m = '6f9619ff-8b86-4d11-b42d-00c04fc964ff';
    const p = '7f9619ff-8b86-4d11-b42d-00c04fc964ff';
    expect(new URL(pinLink(m, p)).pathname).toBe(`/maps/${m}`);
    expect(parsePinParam(params(sharedPinLink(m, p)))).toBe(p);
  });
});
