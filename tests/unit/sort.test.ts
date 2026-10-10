import { describe, expect, it } from 'vitest';
import { sortEvents, sortPlaces } from '@/features/discover/sort';
import type { AtlasEvent } from '@/lib/types';

const ev = (id: string, o: Partial<AtlasEvent>): AtlasEvent => ({ id, name: id, startsAt: null, priceMin: null, latitude: null, longitude: null, ...o } as AtlasEvent);

describe('Discover list sorting', () => {
  const a = ev('a', { startsAt: '2026-10-12T20:00:00Z', priceMin: 30, latitude: 40.76, longitude: -73.98 });
  const b = ev('b', { startsAt: '2026-10-11T20:00:00Z', priceMin: null, latitude: 40.70, longitude: -74.0 });
  const c = ev('c', { startsAt: null, priceMin: 5, latitude: 40.75, longitude: -73.985 });
  const here = { latitude: 40.749, longitude: -73.986 };

  it('soonest: by start time, unknown last', () => {
    expect(sortEvents([a, b, c], 'soonest', null).map((e) => e.id)).toEqual(['b', 'a', 'c']);
  });
  it('price: lowest verified price first, unknown last (never free)', () => {
    expect(sortEvents([a, b, c], 'price', null).map((e) => e.id)).toEqual(['c', 'a', 'b']);
  });
  it('nearest: needs a location, otherwise falls back to soonest', () => {
    expect(sortEvents([a, b, c], 'nearest', here).map((e) => e.id)).toEqual(['c', 'a', 'b']);
    expect(sortEvents([a, b, c], 'nearest', null).map((e) => e.id)).toEqual(['b', 'a', 'c']);
  });
  it('does not mutate the input', () => {
    const list = [a, b, c];
    sortEvents(list, 'name', null);
    expect(list.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });
  it('places keep prominence order unless sorted by name or distance', () => {
    const p = [{ name: 'Zed', latitude: 40.70, longitude: -74 }, { name: 'Abe', latitude: 40.749, longitude: -73.986 }];
    expect(sortPlaces(p, 'soonest', here).map((x) => x.name)).toEqual(['Zed', 'Abe']);
    expect(sortPlaces(p, 'name', null).map((x) => x.name)).toEqual(['Abe', 'Zed']);
    expect(sortPlaces(p, 'nearest', here).map((x) => x.name)).toEqual(['Abe', 'Zed']);
  });
});
