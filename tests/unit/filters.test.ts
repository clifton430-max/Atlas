import { describe, expect, it } from 'vitest';
import type { AtlasEvent } from '@/lib/types';
import {
  applyDiscoverFilters, EMPTY_FILTERS, localStart, minuteInWindow, priceBandOf, venueOpenDuring,
  type DiscoverFilters,
} from '@/features/discover/filters';

const base: AtlasEvent = {
  id: 'x', provider: 't', externalId: 'x', name: 'E', description: null, imageUrl: null,
  category: 'Music', genre: null, venueName: null, address: null, city: null, region: null, country: null,
  latitude: 1, longitude: 1, startsAt: null, endsAt: null, startLocalDate: null, startLocalTime: null,
  timezone: null, venueOpenTime: null, venueCloseTime: null, priceMin: null, priceMax: null, currency: null,
  ticketUrl: null, sourceUrl: null, sourceName: null, status: null, isDevFixture: false, lastCheckedAt: null,
};
const ev = (o: Partial<AtlasEvent>): AtlasEvent => ({ ...base, ...o, id: o.id ?? Math.random().toString() });
const f = (o: Partial<DiscoverFilters>): DiscoverFilters => ({ ...EMPTY_FILTERS, ...o });

describe('price bands', () => {
  it('are non-overlapping at the boundaries', () => {
    expect(priceBandOf(0)).toBe('p0_5');
    expect(priceBandOf(5)).toBe('p0_5');
    expect(priceBandOf(5.01)).toBe('p5_10');
    expect(priceBandOf(10)).toBe('p5_10');
    expect(priceBandOf(10.01)).toBe('p10_30');
    expect(priceBandOf(30)).toBe('p10_30');
    expect(priceBandOf(30.01)).toBe('p30_plus');
    expect(priceBandOf(null)).toBeNull();
  });

  it('never treats unknown prices as free', () => {
    const unknown = ev({ id: 'u', priceMin: null });
    const free = ev({ id: 'f', priceMin: 0 });
    expect(applyDiscoverFilters([unknown, free], f({ priceBands: ['p0_5'] })).map((e) => e.id)).toEqual(['f']);
    expect(applyDiscoverFilters([unknown, free], f({ priceBands: ['p0_5'], includeUnknownPrice: true })).map((e) => e.id))
      .toEqual(['u', 'f']);
  });

  it('uses the minimum verified price', () => {
    const range = ev({ priceMin: 8, priceMax: 50 });
    expect(applyDiscoverFilters([range], f({ priceBands: ['p5_10'] }))).toHaveLength(1);
    expect(applyDiscoverFilters([range], f({ priceBands: ['p30_plus'] }))).toHaveLength(0);
    // Only a max known: minimum is not verified -> unknown.
    expect(applyDiscoverFilters([ev({ priceMax: 4 })], f({ priceBands: ['p0_5'] }))).toHaveLength(0);
  });
});

describe('time windows', () => {
  it('handle windows crossing midnight (inclusive)', () => {
    const w = { from: '22:00', to: '02:00' };
    expect(minuteInWindow(23 * 60, w)).toBe(true);
    expect(minuteInWindow(60, w)).toBe(true);
    expect(minuteInWindow(120, w)).toBe(true);
    expect(minuteInWindow(12 * 60, w)).toBe(false);
  });

  it('venue hours overlap, including both crossing midnight', () => {
    // Venue 20:00–03:00, window 01:00–02:00 -> open
    expect(venueOpenDuring(20 * 60, 3 * 60, { from: '01:00', to: '02:00' })).toBe(true);
    // Venue 11:00–21:00, window 22:00–23:00 -> closed
    expect(venueOpenDuring(11 * 60, 21 * 60, { from: '22:00', to: '23:00' })).toBe(false);
    // Closing time is exclusive: venue closes 21:00, window starts 21:00
    expect(venueOpenDuring(11 * 60, 21 * 60, { from: '21:00', to: '22:00' })).toBe(false);
    // Window crosses midnight, venue open in the early morning
    expect(venueOpenDuring(6 * 60, 9 * 60, { from: '23:00', to: '06:30' })).toBe(true);
    // open == close means 24h
    expect(venueOpenDuring(0, 0, { from: '04:00', to: '04:30' })).toBe(true);
  });

  it('evaluates start time in the event timezone, not the browser timezone', () => {
    // 2026-10-11T03:30Z is 23:30 on Oct 10 in New York (EDT, UTC-4)
    const e = ev({ startsAt: '2026-10-11T03:30:00.000Z', timezone: 'America/New_York' });
    expect(localStart(e)).toEqual({ date: '2026-10-10', minutes: 23 * 60 + 30 });
    expect(applyDiscoverFilters([e], f({ eventTime: { from: '22:00', to: '01:00' } }))).toHaveLength(1);
    expect(applyDiscoverFilters([e], f({ eventTime: { from: '00:00', to: '04:00' } }))).toHaveLength(0);
  });

  it('prefers provider-local start values when present', () => {
    const e = ev({ startLocalDate: '2026-10-12', startLocalTime: '19:00:00', timezone: null });
    expect(localStart(e)).toEqual({ date: '2026-10-12', minutes: 19 * 60 });
  });

  it('excludes unknown times unless explicitly included', () => {
    const unknown = ev({ id: 'u' });
    const filters = f({ eventTime: { from: '18:00', to: '23:00' } });
    expect(applyDiscoverFilters([unknown], filters)).toHaveLength(0);
    expect(applyDiscoverFilters([unknown], { ...filters, includeUnknownTime: true })).toHaveLength(1);
    // An instant without a timezone cannot be placed in local time -> unknown.
    expect(applyDiscoverFilters([ev({ startsAt: '2026-10-11T20:00:00Z' })], filters)).toHaveLength(0);
  });

  it('keeps venue hours separate from event start', () => {
    const e = ev({ startLocalTime: '20:00', venueOpenTime: null, venueCloseTime: null });
    // Event start matches, but venue hours are unknown -> excluded by a venue filter.
    expect(applyDiscoverFilters([e], f({ venueHours: { from: '19:00', to: '21:00' } }))).toHaveLength(0);
    expect(applyDiscoverFilters([e], f({ eventTime: { from: '19:00', to: '21:00' } }))).toHaveLength(1);
  });
});

describe('composition', () => {
  it('ANDs category, price, date and time', () => {
    const match = ev({ id: 'm', category: 'Music', priceMin: 9, startLocalDate: '2026-10-12', startLocalTime: '21:00' });
    const wrongCat = ev({ id: 'c', category: 'Sports', priceMin: 9, startLocalDate: '2026-10-12', startLocalTime: '21:00' });
    const wrongPrice = ev({ id: 'p', category: 'Music', priceMin: 40, startLocalDate: '2026-10-12', startLocalTime: '21:00' });
    const wrongDate = ev({ id: 'd', category: 'Music', priceMin: 9, startLocalDate: '2026-11-01', startLocalTime: '21:00' });
    const filters = f({
      categories: ['Music'], priceBands: ['p5_10'], dateFrom: '2026-10-10', dateTo: '2026-10-15',
      eventTime: { from: '20:00', to: '23:00' },
    });
    expect(applyDiscoverFilters([match, wrongCat, wrongPrice, wrongDate], filters).map((e) => e.id)).toEqual(['m']);
  });

  it('shows everything when no filters are active', () => {
    expect(applyDiscoverFilters([ev({}), ev({ category: null })], EMPTY_FILTERS)).toHaveLength(2);
  });
});
