import { describe, expect, it } from 'vitest';
import {
  bboxToRadiusQuery, buildTicketmasterUrl, cacheKeyFor, isValidBBox, normalizeTicketmasterEvent, type TmEvent,
} from '../../supabase/functions/_shared/ticketmaster';

const NOW = '2026-10-10T00:00:00.000Z';

const sample: TmEvent = {
  id: 'G5abc',
  name: 'Band Live',
  url: 'https://www.ticketmaster.com/event/G5abc',
  info: 'Doors at 7',
  images: [
    { url: 'https://img/small.jpg', width: 100, ratio: '3_2' },
    { url: 'https://img/wide.jpg', width: 1024, ratio: '16_9' },
    { url: 'http://img/insecure.jpg', width: 1100, ratio: '16_9' },
  ],
  classifications: [{ segment: { name: 'Music' }, genre: { name: 'Undefined' } }],
  dates: {
    start: { localDate: '2026-10-20', localTime: '20:00:00', dateTime: '2026-10-21T00:00:00Z' },
    timezone: 'America/New_York',
    status: { code: 'onsale' },
  },
  priceRanges: [{ min: 25, max: 80, currency: 'usd' }, { min: 15, max: 60, currency: 'USD' }],
  _embedded: { venues: [{
    name: 'Hall', address: { line1: '1 Main St' }, city: { name: 'NYC' }, state: { stateCode: 'NY' },
    country: { countryCode: 'US' }, location: { latitude: '40.75', longitude: '-73.99' },
  }] },
};

describe('normalizeTicketmasterEvent', () => {
  it('maps fields without inventing data', () => {
    const r = normalizeTicketmasterEvent(sample, NOW)!;
    expect(r).toMatchObject({
      provider: 'ticketmaster', external_id: 'G5abc', name: 'Band Live', category: 'Music', genre: null,
      venue_name: 'Hall', latitude: 40.75, longitude: -73.99, starts_at: '2026-10-21T00:00:00.000Z',
      ends_at: null, start_local_date: '2026-10-20', start_local_time: '20:00:00', timezone: 'America/New_York',
      venue_open_time: null, venue_close_time: null, price_min: 15, price_max: 80, currency: 'USD',
      image_url: 'https://img/wide.jpg', ticket_url: 'https://www.ticketmaster.com/event/G5abc',
      source_name: 'Ticketmaster', is_dev_fixture: false, last_checked_at: NOW,
    });
  });

  it('keeps unknown price, coordinates and times as null', () => {
    const r = normalizeTicketmasterEvent({
      id: '1', name: 'TBA show', url: 'javascript:alert(1)',
      dates: { start: { localDate: '2026-11-01', dateTBD: false, timeTBA: true, dateTime: '2026-11-01T00:00:00Z' } },
      _embedded: { venues: [{ location: { latitude: '0', longitude: '0' } }] },
    }, NOW)!;
    expect(r.price_min).toBeNull();
    expect(r.price_max).toBeNull();
    expect(r.latitude).toBeNull();
    expect(r.longitude).toBeNull();
    expect(r.starts_at).toBeNull();
    expect(r.start_local_time).toBeNull();
    expect(r.start_local_date).toBe('2026-11-01');
    expect(r.ticket_url).toBeNull();
  });

  it('rejects events without id or name', () => {
    expect(normalizeTicketmasterEvent({ name: 'x' }, NOW)).toBeNull();
    expect(normalizeTicketmasterEvent({ id: 'x' }, NOW)).toBeNull();
  });
});

describe('query helpers', () => {
  const bbox = { west: -74.1, south: 40.6, east: -73.8, north: 40.9 };
  it('validates bboxes', () => {
    expect(isValidBBox(bbox)).toBe(true);
    expect(isValidBBox({ ...bbox, south: 50 })).toBe(false);
    expect(isValidBBox({ west: 'a' })).toBe(false);
  });
  it('builds a capped radius query', () => {
    const r = bboxToRadiusQuery(bbox);
    expect(r.radiusKm).toBeGreaterThan(10);
    expect(r.radiusKm).toBeLessThan(40);
    expect(bboxToRadiusQuery({ west: -180, south: -80, east: 180, north: 80 }).radiusKm).toBe(300);
  });
  it('puts the key only in the server-side URL and sanitizes dates', () => {
    const url = new URL(buildTicketmasterUrl('KEY', { bbox, keyword: 'jazz', startDate: '2026-10-10', endDate: 'bad' }));
    expect(url.searchParams.get('apikey')).toBe('KEY');
    expect(url.searchParams.get('keyword')).toBe('jazz');
    expect(url.searchParams.get('startDateTime')).toBe('2026-10-10T00:00:00Z');
    expect(url.searchParams.has('endDateTime')).toBe(false);
  });
  it('rounds cache keys so tiny pans reuse fetches', () => {
    expect(cacheKeyFor({ bbox })).toBe(cacheKeyFor({ bbox: { ...bbox, west: -74.11 } }));
  });
});

import { geohash, parseDiscoverRequest } from '../../supabase/functions/_shared/ticketmaster';

describe('geohash', () => {
  it('matches known reference values', () => {
    expect(geohash(57.64911, 10.40744, 11)).toBe('u4pruydqqvj'); // canonical example
    expect(geohash(40.7484, -73.9857, 6)).toBe('dr5ru6');
  });
});

describe('parseDiscoverRequest', () => {
  const bbox = { west: -74.1, south: 40.6, east: -73.8, north: 40.9 };
  const now = new Date('2026-10-10T12:00:00Z');
  it('rejects missing or invalid bboxes', () => {
    expect(parseDiscoverRequest(null, now)).toBeNull();
    expect(parseDiscoverRequest({ bbox: { ...bbox, south: 99 } }, now)).toBeNull();
  });
  it('constrains free-form input', () => {
    const q = parseDiscoverRequest({
      bbox, keyword: 'jazz\u0000\n' + 'x'.repeat(200), category: 'Hacking', startDate: '2026-10-20', endDate: '2026-10-11', page: 99, extra: 'ignored',
    }, now)!;
    expect(q.keyword!.length).toBeLessThanOrEqual(100);
    // eslint-disable-next-line no-control-regex
    expect(q.keyword).not.toMatch(/[\u0000-\u001f]/);
    expect(q.category).toBeNull(); // not a Ticketmaster segment
    expect(q.startDate).toBeNull(); // end before start -> both dropped
    expect(q.endDate).toBeNull();
    expect(q.page).toBe(4);
    expect(q).not.toHaveProperty('extra');
  });
  it('keeps valid filters and drops far-future/invalid dates', () => {
    const q = parseDiscoverRequest({ bbox, category: 'Music', startDate: '2026-10-11', endDate: '2031-01-01' }, now)!;
    expect(q.category).toBe('Music');
    expect(q.startDate).toBe('2026-10-11');
    expect(q.endDate).toBeNull();
    expect(parseDiscoverRequest({ bbox, startDate: '2026-02-30' }, now)!.startDate).toBeNull();
  });
  it('uses geoPoint (not the deprecated latlong) in upstream URLs', async () => {
    const { buildTicketmasterUrl } = await import('../../supabase/functions/_shared/ticketmaster');
    const u = new URL(buildTicketmasterUrl('K', { bbox }));
    expect(u.searchParams.get('geoPoint')).toMatch(/^[0-9b-hjkmnp-z]{9}$/);
    expect(u.searchParams.has('latlong')).toBe(false);
  });
});
